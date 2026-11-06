import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Knex } from 'knex';
import { config } from './config';
import { DEFAULT_ROADMAP_STAGES, DEFAULT_ROADMAP_TASKS } from './constants';

export interface SeedResult {
  seeded: boolean;
  oneTimeCode?: string;
}

/** 生成一次性登录码（未设置 ADMIN_PASSWORD 时使用，启动打印）。 */
function generateOneTimeCode(): string {
  return `jh-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 幂等 seed：users 表为空时写入默认用户（admin）+ 5 阶段路线图及默认任务。
 * 由 index.ts 启动时调用，也可经 `pnpm seed`（seeds/01_default.ts）调用。
 */
export async function runSeed(knex: Knex): Promise<SeedResult> {
  const rows = await knex('users').count('* as c').first();
  if (Number(rows?.c ?? 0) > 0) {
    return { seeded: false };
  }

  const password = config.adminPassword || generateOneTimeCode();
  const passwordHash = await bcrypt.hash(password, 10);

  const [userId] = await knex('users').insert({
    username: 'admin',
    password_hash: passwordHash,
  });

  for (let i = 0; i < DEFAULT_ROADMAP_STAGES.length; i += 1) {
    const stage = DEFAULT_ROADMAP_STAGES[i];
    const [stageId] = await knex('roadmap_stages').insert({
      user_id: userId,
      stage_order: i + 1,
      title: stage.title,
      description: stage.description,
      expected_done_at: null,
    });

    const tasks = DEFAULT_ROADMAP_TASKS[i] ?? [];
    if (tasks.length > 0) {
      await knex('roadmap_tasks').insert(
        tasks.map((title, idx) => ({
          user_id: userId,
          stage_id: stageId,
          title,
          done: false,
          done_at: null,
          sort_order: idx,
        })),
      );
    }
  }

  return {
    seeded: true,
    oneTimeCode: config.adminPassword ? undefined : password,
  };
}
