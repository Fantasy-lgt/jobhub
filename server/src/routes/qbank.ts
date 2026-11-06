import type { FastifyInstance } from 'fastify';
import { ok } from '../lib/http';
import { groupParamSchema, linkCreateSchema, linkDeleteParamSchema } from '../lib/validation';
import {
  createLink,
  deleteLink,
  getGroupDetail,
  getGroups,
  getWeaknesses,
} from '../services/qbank.service';

export async function qbankRoutes(app: FastifyInstance): Promise<void> {
  app.get('/qbank/groups', async (request) => {
    return ok(await getGroups(request.userId));
  });

  app.get('/qbank/groups/:id', async (request) => {
    const { id } = groupParamSchema.parse(request.params);
    return ok(await getGroupDetail(request.userId, id));
  });

  app.post('/qbank/links', async (request) => {
    const body = linkCreateSchema.parse(request.body);
    const link = await createLink(request.userId, body.a_id ?? body.aId!, body.b_id ?? body.bId!, body.type);
    return ok(link, '已保存');
  });

  app.delete('/qbank/links/:id', async (request) => {
    const { id } = linkDeleteParamSchema.parse(request.params);
    await deleteLink(request.userId, id);
    return ok(null, '已取消');
  });

  app.get('/qbank/weaknesses', async (request) => {
    return ok(await getWeaknesses(request.userId));
  });
}
