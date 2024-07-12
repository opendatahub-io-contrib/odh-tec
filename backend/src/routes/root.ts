import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default async (fastify: FastifyInstance): Promise<void> => {
  if (process.env.NB_PREFIX) {
    // We are in an OpenShift AI environment with prefixes for the probes...
    fastify.get(
      `${process.env.NB_PREFIX}/api`,
      async (req: FastifyRequest, reply: FastifyReply) => {
        reply.send({ status: 'ok' });
      },
    );

    fastify.get(
      `${process.env.NB_PREFIX}/api/`,
      async (req: FastifyRequest, reply: FastifyReply) => {
        reply.send({ status: 'ok' });
      },
    );

    fastify.get(
      `${process.env.NB_PREFIX}/api/kernels`,
      async (req: FastifyRequest, reply: FastifyReply) => {
        const replyData = [
          {
            id: 'odh-tec',
            name: 'odh-tec',
            last_activity: new Date().toISOString(),
            execution_state: 'alive',
            connections: 1,
          },
        ];
        reply.send(replyData);
      },
    );

    fastify.get(
      `${process.env.NB_PREFIX}/api/kernels/`,
      async (req: FastifyRequest, reply: FastifyReply) => {
        const replyData = [
          {
            id: 'odh-tec',
            name: 'odh-tec',
            last_activity: new Date().toISOString(),
            execution_state: 'alive',
            connections: 1,
          },
        ];
        reply.send(replyData);
      },
    );

    // Redirect all other requests to the root...
    fastify.get(
      `${process.env.NB_PREFIX}/*`,
      async (request: FastifyRequest, reply: FastifyReply) => {
        reply.redirect('/');
      },
    );

    fastify.get(
      `${process.env.NB_PREFIX}`,
      async (request: FastifyRequest, reply: FastifyReply) => {
        reply.redirect('/');
      },
    );
  } else {
    // We are not in an OpenShift AI environment, but let's put the probes in place anyway...
    fastify.get(`/api`, async (req: FastifyRequest, reply: FastifyReply) => {
      reply.send({ status: 'ok' });
    });

    fastify.get(`/api/`, async (req: FastifyRequest, reply: FastifyReply) => {
      reply.send({ status: 'ok' });
    });

    fastify.get(`/api/kernels`, async (req: FastifyRequest, reply: FastifyReply) => {
      const replyData = [
        {
          id: 'odh-tec',
          name: 'odh-tec',
          last_activity: new Date().toISOString(),
          execution_state: 'alive',
          connections: 1,
        },
      ];
      reply.send(replyData);
    });

    fastify.get(`/api/kernels/`, async (req: FastifyRequest, reply: FastifyReply) => {
      const replyData = [
        {
          id: 'odh-tec',
          name: 'odh-tec',
          last_activity: new Date().toISOString(),
          execution_state: 'alive',
          connections: 1,
        },
      ];
      reply.send(replyData);
    });
  }
};
