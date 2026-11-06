import { db } from '../db';

/**
 * 离线全量 JSON 导出（本期只导出，不做导入恢复）。
 * - 只读：按 req.userId 过滤，不写任何表、不触发迁移/seed。
 * - 全量：14 张业务表，含软删除数据（deleted_at 非空）以便离线留档。
 * - 不含凭据：users 走列白名单，再对所有行做敏感字段兜底剔除。
 */

export const EXPORT_SCHEMA_VERSION = 1;

/** 除 users 外的 13 张业务表，统一有 user_id 列。 */
const USER_SCOPED_TABLES: readonly string[] = [
  'profiles',
  'resumes',
  'apps',
  'app_events',
  'interviews',
  'interview_questions',
  'question_analyses',
  'question_links',
  'offers',
  'weekly_reviews',
  'roadmap_stages',
  'roadmap_tasks',
  'checkins',
];

/** 敏感列名兜底：任何凭据类字段都不进导出文件。 */
const SENSITIVE_COLUMN = /password|passwd|pwd|secret|token|credential|api[_-]?key|private[_-]?key/i;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_COLUMN.test(key)) continue;
      out[key] = scrubValue(nested);
    }
    return out;
  }
  return value;
}

export interface ExportPayload {
  format: 'jobhub-offline-backup';
  schemaVersion: number;
  exportedAt: string;
  userId: number;
  tables: Record<string, Array<Record<string, unknown>>>;
}

export async function exportUserData(userId: number): Promise<ExportPayload> {
  const tables: Record<string, Array<Record<string, unknown>>> = {};

  // users 显式列白名单：password_hash 从源头就不被查出
  const users = await db('users')
    .where({ id: userId })
    .select(['id', 'username', 'created_at']);
  tables.users = (users as Array<Record<string, unknown>>).map(
    (row) => scrubValue(row) as Record<string, unknown>,
  );

  for (const table of USER_SCOPED_TABLES) {
    const rows = await db(table).where({ user_id: userId });
    tables[table] = (rows as Array<Record<string, unknown>>).map(
      (row) => scrubValue(row) as Record<string, unknown>,
    );
  }

  return {
    format: 'jobhub-offline-backup',
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    tables,
  };
}
