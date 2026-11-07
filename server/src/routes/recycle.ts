/**
 * 回收站路由：/api/v1/recycle（由 routes/index.ts 注册到受保护作用域，
 * 自带 requireApiKeyOrAuth → 浏览器 cookie / Bearer / X-API-Key 均可）。
 *
 * GET    /api/v1/recycle                 → 四类软删记录列表
 * POST   /api/v1/recycle/:type/:id/restore → 恢复（清除 deleted_at）
 * DELETE /api/v1/recycle/:type/:id       → 彻底删除（物理 DELETE）
 */
import type { FastifyInstance } from 'fastify';
import { badRequest, ok } from '../lib/http';
import {
  assertRecycleType,
  listRecycled,
  purgeRecycled,
  restoreRecycled,
  type RecycleType,
} from '../services/recycle.service';

interface TypeIdParams {
  type?: string;
  id?: string;
}

/** 解析并校验 :type / :id；非法 type → 400，非法 id → 400。 */
function parseTypeAndId(params: unknown): { type: RecycleType; id: number } {
  const p = (params ?? {}) as TypeIdParams;
  if (!p.type) throw badRequest('缺少回收站类型');
  assertRecycleType(p.type); // 非法 type → 400

  const id = Number(p.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('非法的记录 ID');
  return { type: p.type, id };
}

export async function recycleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/recycle', async (request) => {
    return ok(await listRecycled(request.userId));
  });

  app.post('/recycle/:type/:id/restore', async (request) => {
    const { type, id } = parseTypeAndId(request.params);
    await restoreRecycled(type, id, request.userId);
    return ok(null, '已恢复');
  });

  app.delete('/recycle/:type/:id', async (request) => {
    const { type, id } = parseTypeAndId(request.params);
    await purgeRecycled(type, id, request.userId);
    return ok(null, '已彻底删除');
  });
}
