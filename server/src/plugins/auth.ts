import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { resolveJwtSecret } from '../config';

/**
 * 鉴权基础插件：注册 @fastify/cookie + @fastify/jwt。
 * JWT HS256，7 天有效；登录时写 httpOnly cookie（SameSite=Lax，生产 Secure）。
 */
export const authPlugin = fp(async (app) => {
  const jwtSecret = resolveJwtSecret(); // 缺失直接抛错 → 启动 fail-fast

  // cookie 签名密钥从 JWT_SECRET 派生，避免同一密钥材料直接复用于两种用途。
  // 当前 token cookie 未启用 signed，派生不影响已有会话语义。
  const cookieSecret = createHash('sha256')
    .update('jobhub-cookie-signing|')
    .update(jwtSecret)
    .digest('hex');

  await app.register(cookie, { secret: cookieSecret });

  await app.register(jwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '7d',
    },
    cookie: {
      cookieName: 'jobhub_token',
      signed: false,
    },
  });
});

// ---------- 会话失效（零表结构改动） ----------

/** token 最长有效期，与 jwt.sign.expiresIn 对齐。 */
export const SESSION_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** 进程内黑名单上限（单人自用的保守防御，避免无界增长）。 */
const REVOKED_CAP = 1000;
/** sid -> 过期时间戳(ms)。进程内、单实例有效；重启后清空（见回传说明）。 */
const revokedSessions = new Map<string, number>();

/** 每次登录生成唯一会话 id，用于 logout 精确吊销。 */
export function createSessionId(): string {
  return randomUUID();
}

/**
 * 由 users.password_hash 派生的绑定片段（sha256 摘要，不放原始 bcrypt hash 进 JWT）。
 * 改密 → bcrypt 生成新 hash → 绑定变化 → 所有旧 token 立即失效。
 */
export function createSessionBinding(passwordHash: string): string {
  return createHash('sha256').update(passwordHash, 'utf8').digest('hex');
}

/** 定长、定时安全比较，校验 payload 中的绑定片段是否仍与当前密码一致。 */
export function isSessionBindingValid(currentPasswordHash: string, claim: unknown): boolean {
  if (typeof claim !== 'string' || claim.length === 0) return false;
  const expected = Buffer.from(createSessionBinding(currentPasswordHash), 'utf8');
  const actual = Buffer.from(claim, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function purgeExpired(now: number): void {
  for (const [sid, expiresAt] of revokedSessions) {
    if (expiresAt <= now) revokedSessions.delete(sid);
  }
}

/** 吊销会话；过期时间不超过 token 最长有效期，保证覆盖 token 剩余生命周期。 */
export function revokeSession(sid: string, expiresAtMs?: number): void {
  if (!sid) return;
  const now = Date.now();
  purgeExpired(now);
  const deadline = Math.min(expiresAtMs ?? now + SESSION_MAX_AGE_MS, now + SESSION_MAX_AGE_MS);
  if (deadline <= now) return;
  revokedSessions.set(sid, deadline);
  if (revokedSessions.size > REVOKED_CAP) {
    // Map 保序，淘汰最早加入的条目
    for (const oldSid of revokedSessions.keys()) {
      revokedSessions.delete(oldSid);
      if (revokedSessions.size <= REVOKED_CAP) break;
    }
  }
}

export function isSessionRevoked(sid: string): boolean {
  const expiresAt = revokedSessions.get(sid);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    revokedSessions.delete(sid);
    return false;
  }
  return true;
}
