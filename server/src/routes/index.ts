import type { FastifyInstance } from 'fastify';
import { requireApiKeyOrAuth } from '../middleware/requireApiKey';
import { authRoutes } from './auth';
import { overviewRoutes } from './overview';
import { profileRoutes } from './profile';
import { appsRoutes } from './apps';
import { interviewsRoutes } from './interviews';
import { qbankRoutes } from './qbank';
import { offersRoutes } from './offers';
import { analyticsRoutes } from './analytics';
import { roadmapRoutes } from './roadmap';
import { aiRoutes } from './ai';
import { exportRoutes } from './export';
import { importRoutes } from './import';
import { recycleRoutes } from './recycle';

/**
 * 注册全部路由：/api/v1/auth 免登录，其余 /api/v1/* 需鉴权。
 *
 * 鉴权方式（组合 preHandler，见 middleware/requireApiKey.ts）：
 * - 浏览器 cookie（jobhub_token）
 * - Authorization: Bearer <jwt>
 * - X-API-Key: <JOBHUB_API_KEY>（对外接口，可随时吊销）
 * auth 三个端点仍只走原 requireAuth / 公开逻辑，不受 API Key 影响。
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // 导出接口单独注册（prefix /api/v1），其 preHandler 为 requireApiKeyOrAuth，
  // 因此 /export 同时支持 cookie / Bearer（浏览器下载）与 X-API-Key（外部程序备份）。
  await app.register(exportRoutes, { prefix: '/api/v1' });

  await app.register(
    async (protectedScope) => {
      protectedScope.addHook('preHandler', requireApiKeyOrAuth);
      await protectedScope.register(overviewRoutes);
      await protectedScope.register(profileRoutes);
      await protectedScope.register(appsRoutes);
      await protectedScope.register(interviewsRoutes);
      await protectedScope.register(qbankRoutes);
      await protectedScope.register(offersRoutes);
      await protectedScope.register(analyticsRoutes);
      await protectedScope.register(roadmapRoutes);
      await protectedScope.register(aiRoutes);
      // 对外批量导入（豆包产出的 JSON 由主理人本地导入）
      await protectedScope.register(importRoutes);
      // 回收站：软删记录的列表 / 恢复 / 彻底删除（受组合鉴权保护）
      await protectedScope.register(recycleRoutes);
    },
    { prefix: '/api/v1' },
  );
}
