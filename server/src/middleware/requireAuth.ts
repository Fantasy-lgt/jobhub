import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, unauthorized } from '../lib/http';
import { db } from '../db';
import { isSessionBindingValid, isSessionRevoked } from '../plugins/auth';
import type { UserRow } from '../types';

interface SessionPayload {
  userId: number;
  username: string;
  /** 会话 id：logout 时加入进程内黑名单 */
  sid?: string;
  /** users.password_hash 的派生绑定片段：改密后旧 token 自动失效 */
  pwd?: string;
}

/**
 * 鉴权中间件：校验 JWT（优先 cookie，兼容 Authorization: Bearer），
 * 成功后注入 req.userId。
 *
 * 除签名/有效期外，额外做两道校验（零表结构改动）：
 * 1) sid 命中进程内黑名单 → 拒绝（logout 真正失效）；
 * 2) payload.pwd 与 users.password_hash 当前派生值比对 → 改密后所有旧 token 失效。
 * 旧版无 sid/pwd 的 token 一律视为失效，需重新登录。
 */
export async function requireAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized();
  }

  const payload = request.user as unknown as SessionPayload | undefined;
  if (!payload || !payload.userId || !payload.sid || !payload.pwd) {
    throw unauthorized('登录状态已失效，请重新登录');
  }

  if (isSessionRevoked(payload.sid)) {
    throw unauthorized('会话已退出，请重新登录');
  }

  let user: UserRow | undefined;
  try {
    user = await db<UserRow>('users').where({ id: payload.userId }).first();
  } catch (err) {
    request.log.error({ err }, '[auth] 校验会话时数据库不可用');
    throw new AppError(503, '服务暂不可用：无法校验登录状态');
  }

  if (!user || !isSessionBindingValid(user.password_hash, payload.pwd)) {
    throw unauthorized('登录状态已失效，请重新登录');
  }

  request.userId = user.id;
}
