import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    /** 由 requireAuth 中间件注入的当前用户 id。 */
    userId: number;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: number; username: string };
    user: { userId: number; username: string };
  }
}
