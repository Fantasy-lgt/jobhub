import type { FastifyInstance } from 'fastify';
import { requireApiKeyOrAuth } from '../middleware/requireApiKey';
import { exportUserData } from '../services/export.service';

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * GET /api/v1/export：离线全量 JSON 备份（附件下载）。
 * preHandler 用组合鉴权 requireApiKeyOrAuth：带 X-API-Key 的外部程序可备份，
 * 不带则回退 requireAuth（cookie / Bearer），无凭据 401。
 */
export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/export', { preHandler: requireApiKeyOrAuth }, async (request, reply) => {
    const payload = await exportUserData(request.userId);
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="jobhub-backup-${dateStamp()}.json"`,
    );
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(payload);
  });
}
