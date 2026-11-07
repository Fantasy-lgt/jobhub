import path from 'path';
import fs from 'fs';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { authPlugin } from './plugins/auth';
import { errorHandlerPlugin } from './plugins/error-handler';
import { checkReadiness } from './db';
import { registerRoutes } from './routes';
import { config } from './config';

/** 构造 Fastify 实例：插件 + 路由 + 静态托管 + SPA fallback。 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    // 统一响应体较大（聚合接口），放宽默认限制；POST /import 单独放宽到 10MB
    bodyLimit: 2 * 1024 * 1024,
    // 反向代理（cPanel/Passenger/Nginx）下取真实客户端 IP：
    // 不信任代理时 request.ip 会是代理地址，会让 IP 白名单与限流全部失效。
    // 默认 false；生产按 TRUST_PROXY 配置，单层代理推荐 1（而不是 true，避免 XFF 伪造绕过）。
    trustProxy: config.trustProxy,
  });

  // 允许 content-type=application/json 但 body 为空的请求（如回收站 restore 的无 payload POST）。
  // Fastify 默认 JSON 解析器在 content-type=json 且 body 为空时会抛 FST_ERR_CTP_EMPTY_JSON_BODY，
  // 导致前端 http.post 不带 body、或外部程序空 body POST 一律 500。这里将空 body 解析为 {}。
  // 需要 body 的路由仍由 zod schema 校验，空 {} 会按「缺少必填字段」正常返回 400，不会弱化校验。
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '' || body == null) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.register(errorHandlerPlugin);
  app.register(authPlugin);

  // Liveness：恒 200、不查库，仅表示进程存活；DB 就绪判据一律看 /ready。
  app.get('/health', async () => ({
    code: 0,
    data: { status: 'ok', time: new Date().toISOString() },
    message: 'ok',
  }));

  // Readiness（无鉴权）：14 张业务表 + 迁移基线齐全才 200，否则 503 + 明细。
  app.get('/ready', async (_request, reply) => {
    const readiness = await checkReadiness();
    const ready = readiness.ready;
    return reply.status(ready ? 200 : 503).send({
      code: ready ? 0 : 503,
      data: {
        status: ready ? 'ready' : 'not_ready',
        missingTables: readiness.missingTables,
        appliedMigrations: readiness.appliedMigrations,
        requiredMigrations: readiness.requiredMigrations,
        ...(readiness.error ? { error: readiness.error } : {}),
        time: new Date().toISOString(),
      },
      message: ready
        ? 'ready'
        : `数据库未就绪：缺表 ${readiness.missingTables.length} 张，已应用迁移 ${readiness.appliedMigrations}/${readiness.requiredMigrations}${readiness.error ? `，${readiness.error}` : ''}`,
    });
  });

  // 业务路由（/api/v1）
  app.register(registerRoutes);

  // 生产：@fastify/static 托管前端 dist（server/public），SPA 深层链接 fallback
  const publicDir = path.join(__dirname, '..', 'public');
  if (fs.existsSync(publicDir)) {
    app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/',
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ code: 404, data: null, message: 'Not Found' });
    });
  } else {
    // 当前开发态只跑 server，没有前端产物：明确告警，避免静默 404 难以定位
    app.log.warn(
      `[static] 静态资源目录不存在，跳过前端托管：${publicDir}（非 /api 请求将返回 404）`,
    );
    app.setNotFoundHandler((_request, reply) => {
      return reply.status(404).send({ code: 404, data: null, message: 'Not Found' });
    });
  }

  return app;
}
