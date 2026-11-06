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
  deepseek: DeepSeekConfig;
}

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  // 共享主机（Phusion Passenger）会注入 PORT，本地默认 3000
  port: toNumber(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
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
