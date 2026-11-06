import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/requireAuth';
import { exportUserData } from '../services/export.service';

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** GET /api/v1/export：离线全量 JSON 备份（附件下载）。 */
export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/export', { preHandler: requireAuth }, async (request, reply) => {
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
