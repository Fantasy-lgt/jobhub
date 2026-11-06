import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { config } from '../config';
import { ok, unauthorized, badRequest, notFound } from '../lib/http';
import { requireAuth } from '../middleware/requireAuth';
import { createSessionBinding, createSessionId, revokeSession } from '../plugins/auth';
import { loginSchema, changePasswordSchema } from '../lib/validation';
import type { PublicUser, UserRow } from '../types';

const TOKEN_COOKIE = 'jobhub_token';
const TOKEN_MAX_AGE_SECONDS = 7 * 24 * 3600;

function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, username: user.username };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /** 登录：签发 JWT 写 httpOnly cookie，body 只返回用户（不再回传 token）。 */
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await db<UserRow>('users').where({ username: body.username }).first();
    if (!user) throw unauthorized('用户名或密码错误');

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) throw unauthorized('用户名或密码错误');

    // sid 供 logout 精确吊销；pwd 绑定当前 password_hash，改密后旧 token 全部失效
    const payload = {
      userId: user.id,
      username: user.username,
      sid: createSessionId(),
      pwd: createSessionBinding(user.password_hash),
    };
    const token = await reply.jwtSign(payload);
    reply.setCookie(TOKEN_COOKIE, token, {
      httpOnly: true,
      // 单人同源部署：Lax 足以挡跨站写，且不影响正常导航
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_MAX_AGE_SECONDS,
      secure: config.isProd,
    });

    return ok({ user: toPublicUser(user) }, '登录成功');
  });

  /** 当前用户信息 */
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    const user = await db<UserRow>('users').where({ id: request.userId }).first();
    if (!user) throw notFound('用户不存在');
    return ok({ user: toPublicUser(user) });
  });

  /** 修改密码（预留多用户）：不重签 token，旧会话（含当前会话）需重新登录。 */
  app.post('/change-password', { preHandler: requireAuth }, async (request) => {
    const body = changePasswordSchema.parse(request.body);
    const user = await db<UserRow>('users').where({ id: request.userId }).first();
    if (!user) throw notFound('用户不存在');

    const valid = await bcrypt.compare(body.oldPassword, user.password_hash);
    if (!valid) throw badRequest('原密码错误');

    const hash = await bcrypt.hash(body.newPassword, 10);
    await db('users').where({ id: user.id }).update({ password_hash: hash });
    // password_hash 变化 → requireAuth 中 pwd 绑定比对失败 → 所有此前签发的 token 立即失效
    return ok(null, '密码已修改，请重新登录');
  });

  /** 退出登录：把 sid 加入进程内黑名单 + 清除 cookie，旧 token 不再可用。 */
  app.post('/logout', async (request, reply) => {
    try {
      await request.jwtVerify();
      const payload = request.user as unknown as { sid?: string; exp?: number } | undefined;
      if (payload?.sid) {
        revokeSession(
          payload.sid,
          typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
        );
      }
    } catch {
      // token 无效/已过期：无需吊销，仍清 cookie（幂等）
    }
    reply.clearCookie(TOKEN_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: config.isProd,
    });
    return ok(null, '已退出登录');
  });
}
