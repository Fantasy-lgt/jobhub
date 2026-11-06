import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/http';

/**
 * 统一错误响应：任何抛出的错误都转成 { code, data, message }。
 * - AppError：按其 statusCode/code 返回
 * - ZodError：400 参数校验失败
 * - 其它：500 + 日志
 */
export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        data: null,
        message: error.message,
      });
    }

    if (error instanceof ZodError) {
      const detail = error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      return reply.status(400).send({
        code: 400,
        data: null,
        message: `参数校验失败：${detail}`,
      });
    }

    // Fastify 内建 JSON schema 校验错误
    if (error.validation) {
      return reply.status(400).send({
        code: 400,
        data: null,
        message: `参数校验失败：${error.message}`,
      });
    }

    // 请求体超限：Fastify 抛 FST_ERR_CTP_BODY_TOO_LARGE（默认会被兜底成 500，调用方会误判为服务端故障）
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || error.statusCode === 413) {
      return reply.status(413).send({
        code: 413,
        data: null,
        message: '请求体过大，单次导入上限 10MB',
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      code: 500,
      data: null,
      message: '服务器内部错误',
    });
  });
});
