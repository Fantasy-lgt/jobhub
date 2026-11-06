import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/requireAuth';
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

/** 注册全部路由：/api/v1/auth 免登录，其余 /api/v1/* 需鉴权。 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  // 导出接口自带 requireAuth，单独注册避免与 protectedScope 的 preHandler 重复执行
  await app.register(exportRoutes, { prefix: '/api/v1' });

  await app.register(
    async (protectedScope) => {
      protectedScope.addHook('preHandler', requireAuth);
      await protectedScope.register(overviewRoutes);
      await protectedScope.register(profileRoutes);
      await protectedScope.register(appsRoutes);
      await protectedScope.register(interviewsRoutes);
      await protectedScope.register(qbankRoutes);
      await protectedScope.register(offersRoutes);
      await protectedScope.register(analyticsRoutes);
      await protectedScope.register(roadmapRoutes);
      await protectedScope.register(aiRoutes);
    },
    { prefix: '/api/v1' },
  );
}
