import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';
import { assertProductionConfig, config, resolveJwtSecret } from './config';
import { db, runMigrations } from './db';
import { runSeed } from './seed';

/**
 * Bootstrap：启动时幂等执行迁移 + seed，然后监听 PORT || 3000。
 *
 * 失败分级（服务不宕的前提是「不带着坏结构上线」）：
 * - 连接类：DB 晚于应用就绪（共享主机常见）→ 降级启动并 warn，保留既有弹性；
 * - 结构/权限/DDL 类：ER_NO_SUCH_TABLE / ER_DBACCESS_DENIED_ERROR / SQL 失败
 *   → fail-fast，log.error + exit(1)，绝不 listen；
 * - 配置类致命错误：在 buildApp() 之前校验并终止。
 */

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'EPIPE',
  'ERR_SOCKET_TIMEOUT',
]);

function collectErrorCodes(err: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = err;
  // mysql2 / knex 可能把原始错误挂在 cause / original / parent 上
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const node = current as {
      code?: unknown;
      cause?: unknown;
      original?: unknown;
      parent?: unknown;
    };
    if (typeof node.code === 'string' || typeof node.code === 'number') {
      codes.push(String(node.code));
    }
    current = node.cause ?? node.original ?? node.parent;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  for (const code of CONNECTION_ERROR_CODES) {
    if (message.includes(code)) codes.push(code);
  }
  return codes;
}

/** 仅「明确的连接类错误」允许降级；其余一律视为结构/权限/DDL 致命错误。 */
function isConnectionError(err: unknown): boolean {
  return collectErrorCodes(err).some((code) => CONNECTION_ERROR_CODES.has(code));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

async function fatal(app: FastifyInstance, stage: string, err: unknown): Promise<never> {
  app.log.error(
    `[db] ${stage} 失败（结构/权限/DDL 类错误，拒绝监听）：${messageOf(err)}`,
  );
  try {
    await db.destroy();
  } catch {
    // 连接已不可用时 destroy 可能失败，不影响终止
  }
  process.exit(1);
}

async function main(): Promise<void> {
  // 1) 配置类致命错误：必须在 buildApp() 之前校验，避免带病注册插件
  try {
    assertProductionConfig();
    resolveJwtSecret();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[config] 启动终止：${messageOf(err)}`);
    process.exit(1);
  }

  const app = buildApp();

  // 2) 迁移
  try {
    app.log.info('[db] running migrations...');
    await runMigrations();
    app.log.info('[db] migrations up to date');
  } catch (err) {
    if (isConnectionError(err)) {
      app.log.warn(
        `[db] 数据库暂不可达，跳过迁移：${messageOf(err)}（服务仍会启动，DB 操作将报错）`,
      );
    } else {
      await fatal(app, 'migrations', err);
    }
  }

  // 3) seed
  try {
    const result = await runSeed(db);
    if (result.seeded) {
      if (result.oneTimeCode) {
        // 未设置 ADMIN_PASSWORD：打印一次性登录码
        app.log.warn(
          `[seed] 已创建默认用户 admin，一次性登录码：${result.oneTimeCode}（请登录后尽快修改密码）`,
        );
      } else {
        app.log.info('[seed] 已创建默认用户 admin（密码来自 ADMIN_PASSWORD）');
      }
    }
  } catch (err) {
    if (isConnectionError(err)) {
      app.log.warn(`[seed] 数据库暂不可达，跳过 seed：${messageOf(err)}`);
    } else {
      await fatal(app, 'seed', err);
    }
  }

  const port = config.port;
  const host = config.host;
  try {
    await app.listen({ port, host });
    app.log.info(`[server] listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(`[server] failed to listen: ${messageOf(err)}`);
    process.exit(1);
  }
}

main();
