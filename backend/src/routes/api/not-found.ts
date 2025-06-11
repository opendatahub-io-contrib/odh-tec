import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logAccess } from '../../utils/logAccess';

export default async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/*', (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    reply.notFound();
  });
};
