import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getLastAccessLogEntry } from '../utils/logAccess';

// Route configuration
const ROUTES = {
  API: '/api',
  KERNELS: '/api/kernels',
  TERMINALS: '/api/terminals',
} as const;

// Route handlers
const handlers = {
  healthCheck: async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'ok' });
  },

  getAccessLog: (log: any) => async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const replyData = await getLastAccessLogEntry(log);
      reply.send(replyData);
    } catch (error) {
      reply.status(500).send({
        error: 'Failed to retrieve access log',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  redirectToRoot: async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.redirect('/');
  },
};

// Helper function to register routes with optional trailing slash handling
const registerRoute = (
  fastify: FastifyInstance,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  handler: any,
  handleTrailingSlash = true,
) => {
  fastify[method](path, handler);
  if (handleTrailingSlash && !path.endsWith('/')) {
    fastify[method](`${path}/`, handler);
  }
};

// Helper function to register all API routes for a given prefix
const registerApiRoutes = (fastify: FastifyInstance, prefix = '') => {
  const prefixedPath = (path: string) => `${prefix}${path}`;
  const accessLogHandler = handlers.getAccessLog(fastify.log);

  // Health check endpoints
  registerRoute(fastify, 'get', prefixedPath(ROUTES.API), handlers.healthCheck);

  // Access log endpoints
  registerRoute(fastify, 'get', prefixedPath(ROUTES.KERNELS), accessLogHandler);
  registerRoute(fastify, 'get', prefixedPath(ROUTES.TERMINALS), accessLogHandler);
};

export default async (fastify: FastifyInstance): Promise<void> => {
  const nbPrefix = process.env.NB_PREFIX;

  if (nbPrefix) {
    // Register OpenShift AI environment routes with prefix
    registerApiRoutes(fastify, nbPrefix);

    // Redirect handlers for prefixed routes
    registerRoute(fastify, 'get', `${nbPrefix}/*`, handlers.redirectToRoot, false);
    registerRoute(fastify, 'get', nbPrefix, handlers.redirectToRoot, false);
  }

  // Register standard routes (always available)
  registerApiRoutes(fastify);
};
