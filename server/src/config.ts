import 'dotenv/config';

/** 读取环境变量并做类型化，全部集中在此，代码中不直接读 process.env。 */

function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** 逗号分隔字符串 → 去空数组（IP 白名单等列表型配置）。 */
function toList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 反向代理信任层数（Fastify trustProxy）。
 * - 未配置 / 0 / false → false（不信任任何代理，直接取 socket 地址）
 * - true/1/yes/on → 1（只信任最近一层代理，最安全，也是生产推荐值）
 * - 其他正整数 n → n（多层代理）
 * 用 1 而不是 true：`true` 会无条件相信 X-Forwarded-For 最左值，客户端可伪造 IP 绕过白名单/限流。
 */
function toTrustProxy(value: string | undefined): boolean | number {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return 1;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 1) return Math.floor(n);
  return false;
}

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

export interface DeepSeekConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  maxTokens: number;
}

export interface AppConfig {
  env: string;
  isProd: boolean;
  port: number;
  host: string;
  db: DbConfig;
  jwtSecret: string;
  adminPassword: string;
  /** 对外开放接口的 API Key（请求头 X-API-Key）；空串 = 该通道整体禁用 */
  apiKey: string;
  /** API Key 通道允许的来源 IP（归一化后精确匹配）；空数组 = 不限来源 */
  apiKeyAllowIps: string[];
  /** 反向代理信任层数（Fastify trustProxy）：false=不信任，1=只信任一层代理 */
  trustProxy: boolean | number;
  deepseek: DeepSeekConfig;
}

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  // 共享主机（Phusion Passenger）会注入 PORT，本地默认 3000
  port: toNumber(process.env.PORT, 3000),
  // GoDaddy / 容器平台通过反向代理访问，必须监听 0.0.0.0 才能收到流量；
  // 本地开发 bind 0.0.0.0 同样可在 127.0.0.1 访问，无副作用。可用 HOST 环境变量覆盖。
  host: process.env.HOST || '0.0.0.0',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'jobhub',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jobhub',
    ssl: toBool(process.env.DB_SSL, false),
  },
  jwtSecret: process.env.JWT_SECRET || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // 对外接口 API Key：仅从环境变量读取，绝不落日志；空串时 /api/v1 的 X-API-Key 通道自动关闭
  apiKey: (process.env.JOBHUB_API_KEY || '').trim(),
  apiKeyAllowIps: toList(process.env.JOBHUB_API_KEY_ALLOW_IPS),
  trustProxy: toTrustProxy(process.env.TRUST_PROXY),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeoutMs: toNumber(process.env.DEEPSEEK_TIMEOUT_MS, 60000),
    maxRetries: toNumber(process.env.DEEPSEEK_MAX_RETRIES, 2),
    maxTokens: toNumber(process.env.DEEPSEEK_MAX_TOKENS, 2000),
  },
};

/**
 * JWT 签名密钥：缺失即 fail-fast，绝不回落到可预测的派生串。
 * 由启动流程在 buildApp() 之前调用；插件注册时也会再调用一次（幂等）。
 */
export function resolveJwtSecret(): string {
  if (config.jwtSecret) return config.jwtSecret;
  throw new Error(
    'JWT_SECRET 未配置：请在 server/.env 中设置 32+ 位随机串后重启服务（拒绝使用可预测的默认密钥启动）。',
  );
}

/**
 * 生产环境配置断言：仅 NODE_ENV=production 时生效，本地 development 不受影响。
 * 只报告缺失的配置项名称，不打印任何值。
 */
export function assertProductionConfig(): void {
  if (!config.isProd) return;
  const missing: string[] = [];
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.adminPassword) missing.push('ADMIN_PASSWORD');
  if (missing.length > 0) {
    throw new Error(`生产环境缺少必需配置：${missing.join('、')}`);
  }
}
