import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { S3Client } from '@aws-sdk/client-s3';
import { NodeJsClient } from '@smithy/types';
import axios from 'axios';

import {
  updateS3Config,
  getS3Config,
  getHFConfig,
  updateHFConfig,
  getMaxConcurrentTransfers,
  updateMaxConcurrentTransfers,
} from '../../../utils/config';

export default async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint } = getS3Config();
    const settings = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: region,
      endpoint: endpoint,
    };
    reply.send({ settings });
  });

  fastify.post('/s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint } = req.body as any;
    try {
      updateS3Config(accessKeyId, secretAccessKey, region, endpoint);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating settings', error);
      reply.code(500).send({ message: error });
    }
  });

  fastify.post('/test-s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint } = req.body as any;
    try {
      const s3ClientTest = new S3Client({
        region: region,
        endpoint: endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      }) as NodeJsClient<S3Client>;
      await s3ClientTest.send(new ListBucketsCommand({}));
      reply.send({ message: 'Connection successful' });
    } catch (error) {
      console.error('Error testing connection', error);
      reply.code(500).send({ message: error });
    }
  });

  fastify.get('/huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const hfToken = getHFConfig();
    const settings = {
      hfToken: hfToken,
    };
    console.log(settings);
    reply.send({ settings });
  });

  fastify.post('/huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hfToken } = req.body as any;
    try {
      updateHFConfig(hfToken);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating settings', error);
      reply.code(500).send({ message: error });
    }
  });

  fastify.post('/test-huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hfToken } = req.body as any;
    try {
      const response = await axios.get('https://huggingface.co/api/whoami-v2?', {
        headers: {
          Authorization: `Bearer ${hfToken}`,
        },
      });
      if (response.status === 200) {
        reply.send({
          message: 'Connection successful',
          accessTokenDisplayName: response.data.auth.accessToken.displayName,
        });
      }
    } catch (error) {
      console.log(error);
      reply.code(500).send({ message: error.response.data });
    }
  });

  fastify.get('/max-concurrent-transfers', async (req: FastifyRequest, reply: FastifyReply) => {
    const maxConcurrentTransfers = getMaxConcurrentTransfers();
    reply.send({ maxConcurrentTransfers });
  });

  fastify.post('/max-concurrent-transfers', async (req: FastifyRequest, reply: FastifyReply) => {
    const { maxConcurrentTransfers } = req.body as any;
    try {
      updateMaxConcurrentTransfers(maxConcurrentTransfers);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating settings', error);
      reply.code(500).send({ message: error });
    }
  });
};
