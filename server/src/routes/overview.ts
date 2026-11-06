import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import { getOverview } from '../services/overview.service';

export async function overviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/overview', async (request) => {
    return ok(await getOverview(request.userId));
  });
}
