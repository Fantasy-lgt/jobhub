import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import { compareQuerySchema, idParamSchema, offerCreateSchema, offerUpdateSchema } from '../lib/validation';
import {
  compareOffers,
  createOffer,
  deleteOffer,
  getOffer,
  listOffers,
  updateOffer,
} from '../services/offers.service';

export async function offersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/offers', async (request) => {
    return ok(await listOffers(request.userId));
  });

  app.post('/offers', async (request) => {
    const body = offerCreateSchema.parse(request.body);
    const offer = await createOffer(request.userId, body);
    return ok(offer, '已创建');
  });

  // 对比须在 /:id 之前
  app.get('/offers/compare', async (request) => {
    const query = compareQuerySchema.parse(request.query);
    const ids = query.ids.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
    return ok(await compareOffers(request.userId, ids));
  });

  app.get('/offers/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    return ok(await getOffer(request.userId, id));
  });

  app.put('/offers/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = offerUpdateSchema.parse(request.body);
    const offer = await updateOffer(request.userId, id, body);
    return ok(offer, '已更新');
  });

  app.delete('/offers/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteOffer(request.userId, id);
    return ok(null, '已删除');
  });
}
