import type { FastifyInstance } from 'fastify';
import { ok, badRequest } from '../lib/http';
import {
  indicatorsQuerySchema,
  trendUpdateSchema,
  weeklyReviewSchema,
  weekStartParamSchema,
} from '../lib/validation';
import {
  getBottleneck,
  getChannels,
  getFunnel,
  getIndicatorDrilldown,
  getIndicators,
  getTrend,
  listWeeklyReviews,
  updateTrend,
  upsertWeeklyReview,
} from '../services/analytics.service';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/analytics/funnel', async (request) => {
    return ok(await getFunnel(request.userId));
  });

  app.get('/analytics/trend', async (request) => {
    return ok(await getTrend(request.userId));
  });

  app.put('/analytics/trend/:weekStart', async (request) => {
    const { weekStart } = weekStartParamSchema.parse(request.params);
    const body = trendUpdateSchema.parse(request.body);
    return ok(await updateTrend(request.userId, weekStart, body), '已更新');
  });

  app.get('/analytics/channels', async (request) => {
    return ok(await getChannels(request.userId));
  });

  app.get('/analytics/bottleneck', async (request) => {
    return ok(await getBottleneck(request.userId));
  });

  app.get('/analytics/indicators', async (request) => {
    const query = indicatorsQuerySchema.parse(request.query);
    return ok(await getIndicators(request.userId, query.range));
  });

  app.get('/analytics/indicators/:key/drilldown', async (request) => {
    const { key } = request.params as { key: string };
    const query = indicatorsQuerySchema.parse(request.query);
    return ok(await getIndicatorDrilldown(request.userId, key, query.range));
  });

  app.get('/analytics/weekly-reviews', async (request) => {
    return ok(await listWeeklyReviews(request.userId));
  });

  app.post('/analytics/weekly-reviews', async (request) => {
    const body = weeklyReviewSchema.parse(request.body);
    const raw = request.body as { week_start?: string; weekStart?: string };
    const weekStart = raw.week_start ?? raw.weekStart;
    if (!weekStart) throw badRequest('week_start 必填');
    return ok(await upsertWeeklyReview(request.userId, weekStart, body), '已保存');
  });

  app.put('/analytics/weekly-reviews/:weekStart', async (request) => {
    const { weekStart } = weekStartParamSchema.parse(request.params);
    const body = weeklyReviewSchema.parse(request.body);
    return ok(await upsertWeeklyReview(request.userId, weekStart, body), '已更新');
  });
}
