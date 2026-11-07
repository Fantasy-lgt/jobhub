/**
 * 回收站 service：对已软删（deleted_at IS NOT NULL）的四类业务记录提供
 * 列表 / 恢复（清除 deleted_at）/ 彻底删除（物理 DELETE）能力。
 *
 * 安全铁律：
 * - 恢复 / 彻底删除均按 user_id + id + deleted_at IS NOT NULL 三重定位，
 *   绝不会误改到有效数据；记录不存在或本就未软删一律 404。
 * - 7 天自动清理只针对「已软删且超过天数」的行，WHERE 强制 deleted_at IS NOT NULL，
 *   绝不碰任何有效记录。
 * - 不新增表 / 列，不写迁移。
 */
import { db } from '../db';
import { badRequest, notFound } from '../lib/http';

/** 支持回收站的四类业务表（与软删列对齐）。 */
export const RECYCLE_TYPES = ['apps', 'resumes', 'interviews', 'offers'] as const;
export type RecycleType = (typeof RECYCLE_TYPES)[number];

function isRecycleType(value: string): value is RecycleType {
  return (RECYCLE_TYPES as readonly string[]).includes(value);
}

/** 未知类型 → 400（路径参数校验）。 */
export function assertRecycleType(value: string): asserts value is RecycleType {
  if (!isRecycleType(value)) {
    throw badRequest('无效的回收站类型（仅支持 apps/resumes/interviews/offers）');
  }
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** 每类记录的表名与可辨识标题构造方式。 */
interface TypeMeta {
  table: RecycleType;
  /** 仅 SELECT 必需列，减少传输量。 */
  columns: string[];
  title: (row: Record<string, unknown>) => string;
}

const META: Record<RecycleType, TypeMeta> = {
  apps: {
    table: 'apps',
    columns: ['id', 'company', 'role', 'deleted_at'],
    title: (r) => `${r.company} · ${r.role}`,
  },
  resumes: {
    table: 'resumes',
    columns: ['id', 'name', 'target_role', 'deleted_at'],
    title: (r) => `${r.name} · ${r.target_role}`,
  },
  interviews: {
    table: 'interviews',
    columns: ['id', 'company', 'role', 'scheduled_at', 'deleted_at'],
    title: (r) => {
      const base = `${r.company} · ${r.role}`;
      const at = toIso(r.scheduled_at);
      return at ? `${base} · ${at.slice(0, 16).replace('T', ' ')}` : base;
    },
  },
  offers: {
    table: 'offers',
    columns: ['id', 'company', 'role', 'deleted_at'],
    title: (r) => `${r.company} · ${r.role}`,
  },
};

export interface RecycleItem {
  id: number;
  title: string;
  deletedAt: string | null;
}

export interface RecycleList {
  apps: RecycleItem[];
  resumes: RecycleItem[];
  interviews: RecycleItem[];
  offers: RecycleItem[];
}

/** 列出当前用户所有软删记录（按删除时间倒序）。 */
export async function listRecycled(userId: number): Promise<RecycleList> {
  const result = {} as RecycleList;
  for (const type of RECYCLE_TYPES) {
    const meta = META[type];
    const rows = await db(meta.table)
      .where({ user_id: userId })
      .whereNotNull('deleted_at')
      .select(meta.columns)
      .orderBy('deleted_at', 'desc');
    result[type] = (rows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      title: meta.title(row),
      deletedAt: toIso(row.deleted_at),
    }));
  }
  return result;
}

/** 恢复：清除该记录的 deleted_at（置 NULL）。记录不存在或未软删 → 404。 */
export async function restoreRecycled(type: RecycleType, id: number, userId: number): Promise<void> {
  const meta = META[type];
  const row = await db(meta.table)
    .where({ id, user_id: userId })
    .whereNotNull('deleted_at')
    .first();
  if (!row) throw notFound('回收站中不存在该记录（可能已被恢复或彻底删除）');
  await db(meta.table).where({ id }).update({ deleted_at: null, updated_at: new Date() });
}

/** 彻底删除：物理 DELETE 该软删记录。记录不存在或未软删 → 404。 */
export async function purgeRecycled(type: RecycleType, id: number, userId: number): Promise<void> {
  const meta = META[type];
  const row = await db(meta.table)
    .where({ id, user_id: userId })
    .whereNotNull('deleted_at')
    .first();
  if (!row) throw notFound('回收站中不存在该记录（可能已被恢复或彻底删除）');
  await db(meta.table).where({ id }).del();
}

export interface PurgeResult {
  total: number;
  byType: Record<RecycleType, number>;
}

/**
 * 自动清理：物理删除「已软删且 deleted_at 早于 NOW()-days 天」的记录。
 * 仅四类表；WHERE 强制 deleted_at IS NOT NULL，绝不触碰有效数据。
 * 无返回值约束，调用方自行决定日志级别。
 */
export async function purgeExpiredRecycled(days = 7): Promise<PurgeResult> {
  const byType: Record<RecycleType, number> = { apps: 0, resumes: 0, interviews: 0, offers: 0 };
  for (const type of RECYCLE_TYPES) {
    const meta = META[type];
    const deleted = await db(meta.table)
      .whereNotNull('deleted_at')
      .whereRaw('deleted_at < NOW() - INTERVAL ? DAY', [days])
      .del();
    byType[type] = Number(deleted);
  }
  const total = RECYCLE_TYPES.reduce((acc, t) => acc + byType[t], 0);
  return { total, byType };
}
