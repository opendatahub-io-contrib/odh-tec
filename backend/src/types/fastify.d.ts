import type { User } from '../plugins/auth';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}
