import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import {
  IMPORT_DATA_SECTIONS,
  importRequestSchema,
  runImport,
  toImportErrors,
  zeroStats,
  type ImportMode,
} from '../services/import.service';

/** 单次导入上限：10MB（其余路由仍是全局 2MB） */
export const IMPORT_BODY_LIMIT = 10 * 1024 * 1024;

/** 提取请求体里 data 下未识别的分节名（zod 非 strict 会静默丢弃，这里显式提示）。 */
function unknownDataSections(body: unknown): string[] {
  const data = (body as { data?: unknown } | null | undefined)?.data;
  if (!data || typeof data !== 'object') return [];
  return Object.keys(data as Record<string, unknown>).filter(
    (key) => !IMPORT_DATA_SECTIONS.includes(key),
  );
}

/**
 * POST /api/v1/import：批量导入（外部 JSON → 业务表）。
 *
 * - 请求体：{ mode: 'append' | 'replace', dryRun: boolean, data: { ... } }
 * - dryRun 默认 true（不传就只演练），必须显式 dryRun:false 才真正写库。
 * - 校验/关联错误 → 422 + data.errors[{path,message}]，且不写库。
 * - bodyLimit 单独放宽到 10MB：几个月历史投递+面试+题目的 JSON 容易超过 2MB。
 */
export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post('/import', { bodyLimit: IMPORT_BODY_LIMIT }, async (request, reply) => {
    const rawBody = request.body ?? {};
    const body = rawBody as { mode?: unknown; dryRun?: unknown };

    const parsed = importRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = toImportErrors(parsed.error);
      const mode: ImportMode = body.mode === 'replace' ? 'replace' : 'append';
      const dryRun = body.dryRun !== false;
      return reply.status(422).send({
        code: 422,
        data: {
          mode,
          dryRun,
          created: zeroStats(),
          updated: zeroStats(),
          skipped: zeroStats(),
          errors,
        },
        message: `导入数据校验失败：${errors.length} 处`,
      });
    }

    const result = await runImport(request.userId, parsed.data);

    const unknown = unknownDataSections(rawBody);
    if (unknown.length > 0) {
      result.warnings.push(`data 下存在未支持的分节，已忽略：${unknown.join('、')}`);
    }

    if (result.errors.length > 0) {
      return reply.status(422).send({
        code: 422,
        data: result,
        message: `导入数据校验失败：${result.errors.length} 处（未写库）`,
      });
    }

    return ok(result, result.dryRun ? '演练完成（未写库）' : '导入完成');
  });
}
