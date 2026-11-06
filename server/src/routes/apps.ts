import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import { appCreateSchema, appStatusSchema, appUpdateSchema, appsQuerySchema, idParamSchema } from '../lib/validation';
import {
  boardStats,
  changeStatus,
  createApp,
  deleteApp,
  getApp,
  listApps,
  updateApp,
} from '../services/apps.service';

export async function appsRoutes(app: FastifyInstance): Promise<void> {
  // 看板统计须在 /:id 之前注册，避免被参数路由吞掉
  app.get('/apps/stats/board', async (request) => {
    return ok(await boardStats(request.userId));
  });

  app.get('/apps', async (request) => {
    const query = appsQuerySchema.parse(request.query);
    const result = await listApps(
      request.userId,
      {
        status: query.status,
        channel: query.channel,
        interest: query.interest,
        overdue: query.overdue === '1' || query.overdue === 'true',
        q: query.q,
      },
      query.page,
      query.pageSize,
    );
    return ok(result);
  });

  app.post('/apps', async (request) => {
    const body = appCreateSchema.parse(request.body);
    const app = await createApp(request.userId, body);
    return ok(app, '已创建');
  });

  app.get('/apps/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const detail = await getApp(request.userId, id);
    return ok(detail);
  });

  app.put('/apps/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = appUpdateSchema.parse(request.body);
    const app = await updateApp(request.userId, id, body);
    return ok(app, '已更新');
  });

  app.patch('/apps/:id/status', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = appStatusSchema.parse(request.body);
    const toStatus = body.to_status ?? body.toStatus!;
    const result = await changeStatus(request.userId, id, toStatus, body.source);
    return ok(result, '状态已更新');
  });

  app.delete('/apps/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteApp(request.userId, id);
    return ok(null, '已删除');
  });
}
