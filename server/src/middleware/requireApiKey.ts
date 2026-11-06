/**
 * 对外开放接口鉴权：X-API-Key 通道 + 回退原有 JWT 鉴权。
 *
 * 设计要点：
 * 1. 不替换 requireAuth：请求未携带 X-API-Key 时原样回退 requireAuth（cookie / Bearer 两种方式不变）；
 *    携带了 X-API-Key 则严格只按 Key 校验，不再回退（避免「无效 Key + 有效 cookie」模糊放行）。
 * 2. 只比对、不打印：密钥比较走 crypto.timingSafeEqual，长度不等直接判否；日志里不出现任何 Key 片段。
 * 3. 通道开关：config.apiKey 为空串时该通道整体禁用（即便客户端传了 Key 也拒绝）。
 * 4. 可选 IP 白名单：config.apiKeyAllowIps 为空表示不限来源；命中白名单才放行。
 * 5. 轻量内存限流：按来源 IP 每 60s 最多 120 次，零新依赖；单实例有效（多实例需换 Redis）。
 */
import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config';
import { AppError, forbidden, unauthorized } from '../lib/http';
import { requireAuth } from './requireAuth';

/** 单人账号：API Key 通道一律映射到唯一用户 id=1（与 requireAuth 注入的语义一致）。 */
export const API_KEY_USER_ID = 1;

/** 限流窗口与配额 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
/** 桶数量上限，超出时先清理过期桶，避免无界增长（防御性，正常单人场景远达不到） */
const RATE_BUCKETS_CAP = 5_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function pruneBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** 计数并返回是否放行；超限时给出建议重试秒数。 */
function hitRateLimit(ip: string, now: number = Date.now()): { allowed: boolean; retryAfterSec: number } {
  if (buckets.size > RATE_BUCKETS_CAP) pruneBuckets(now);

  const current = buckets.get(ip);
  if (!current || current.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  current.count += 1;
  if (current.count > RATE_MAX) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/** 定长、定时安全的字符串比较：先比字节长度，再 timingSafeEqual。 */
function safeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * IP 归一化：去掉 IPv4-mapped 前缀（::ffff:）、IPv6 方括号、zone id（%eth0），统一小写。
 * 目标是让白名单配置与 request.ip 能对齐，不追求完整的 IPv6 规范化。
 */
function normalizeIp(raw: string): string {
  let ip = (raw || '').trim();
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const pct = ip.indexOf('%');
  if (pct > 0) ip = ip.slice(0, pct);
  return ip.toLowerCase();
}

/** 来源 IP 是否命中白名单（白名单为空表示不限）。 */
function isIpAllowed(ip: string): boolean {
  if (config.apiKeyAllowIps.length === 0) return true;
  const normalized = normalizeIp(ip);
  return config.apiKeyAllowIps.some((allow) => normalizeIp(allow) === normalized);
}

/**
 * 组合鉴权 preHandler：
 * - 带 X-API-Key → 校验 API Key（+ 可选 IP 白名单 + 限流），命中后注入 request.userId 放行；
 * - 不带 X-API-Key → 回退 requireAuth（cookie / Bearer），行为与改造前完全一致。
 */
export async function requireApiKeyOrAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers['x-api-key'];
  const rawKey = Array.isArray(header) ? header[0] : header;
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';

  if (key === '') {
    await requireAuth(request, reply);
    return;
  }

  if (!config.apiKey) {
    // 通道未启用：明确拒绝，避免客户端误以为「Key 生效了」
    throw unauthorized('API Key 通道未启用');
  }

  if (!isIpAllowed(request.ip)) {
    request.log.warn({ ip: normalizeIp(request.ip) }, '[api-key] 来源 IP 不在白名单内，拒绝访问');
    throw forbidden('来源 IP 不在 API Key 白名单内');
  }

  if (!safeEqual(key, config.apiKey)) {
    request.log.warn({ ip: normalizeIp(request.ip) }, '[api-key] API Key 校验失败，拒绝访问');
    throw unauthorized('API Key 无效');
  }

  const limit = hitRateLimit(normalizeIp(request.ip));
  if (!limit.allowed) {
    reply.header('Retry-After', String(limit.retryAfterSec));
    throw new AppError(429, `请求过于频繁，请在 ${limit.retryAfterSec}s 后重试`);
  }

  request.userId = API_KEY_USER_ID;
}
