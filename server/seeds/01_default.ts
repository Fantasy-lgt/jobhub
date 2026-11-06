import type { Knex } from 'knex';
import { runSeed } from '../src/seed';

/**
 * 默认 seed：默认用户 admin + 5 阶段路线图 + 默认任务。
 * 由 `pnpm seed`（knex seed:run）手动调用；启动时 index.ts 亦会自动幂等执行。
 */
export async function seed(knex: Knex): Promise<void> {
  const result = await runSeed(knex);
  if (result.seeded) {
    if (result.oneTimeCode) {
      // eslint-disable-next-line no-console
      console.log(`[seed] 已创建默认用户 admin，一次性登录码：${result.oneTimeCode}`);
    } else {
      // eslint-disable-next-line no-console
      console.log('[seed] 已创建默认用户 admin（密码来自 ADMIN_PASSWORD）');
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[seed] users 表非空，跳过默认 seed');
  }
}
