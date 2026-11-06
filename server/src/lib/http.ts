/** 统一响应工具 + 业务异常类型。 */

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export function ok<T>(data: T, message = 'ok'): ApiResponse<T> {
  return { code: 0, data, message };
}

/**
 * 业务异常：code 即 HTTP 语义码（401/403/404/400/409/500…），
 * 由 error-handler 统一转成 { code, data, message }。
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: number;

  constructor(statusCode: number, message: string, code?: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code ?? statusCode;
  }
}

export function badRequest(message: string): AppError {
  return new AppError(400, message);
}

export function notFound(message = '资源不存在'): AppError {
  return new AppError(404, message);
}

export function unauthorized(message = '未登录或登录已过期'): AppError {
  return new AppError(401, message);
}

export function forbidden(message = '无权限访问'): AppError {
  return new AppError(403, message);
}
