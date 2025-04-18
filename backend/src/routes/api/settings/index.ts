import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { NodeJsClient } from '@smithy/types';
import axios, { AxiosRequestConfig } from 'axios';

import {
  updateS3Config,
  getS3Config,
  getHFConfig,
  updateHFConfig,
  getMaxConcurrentTransfers,
  updateMaxConcurrentTransfers,
  getProxyConfig,
  updateProxyConfig,
  initializeS3Client,
} from '../../../utils/config';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';

export default async (fastify: FastifyInstance): Promise<void> => {
  // Retrieve S3 settings
  fastify.get('/s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint, defaultBucket } = getS3Config();
    const settings = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: region,
      endpoint: endpoint,
      defaultBucket: defaultBucket,
    };
    reply.send({ settings });
  });

  // Update S3 settings
  fastify.put('/s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint, defaultBucket } = req.body as any;
    try {
      updateS3Config(accessKeyId, secretAccessKey, region, endpoint, defaultBucket);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      if (error instanceof S3ServiceException) {
        console.error(
          'Error updating S3 settings (S3ServiceException):',
          error.name,
          error.message,
        );
        reply.code(error.$metadata?.httpStatusCode || 500).send({
          error: error.name,
          message: error.message,
        });
      } else {
        console.error('Error updating S3 settings (Unknown):', error);
        const err = error as Error;
        reply.code(500).send({
          error: err.name || 'UnknownError',
          message: err.message || 'An unexpected error occurred',
        });
      }
    }
  });

  // Test S3 connection
  fastify.post('/test-s3', async (req: FastifyRequest, reply: FastifyReply) => {
    const { accessKeyId, secretAccessKey, region, endpoint } = req.body as any;
    try {
      const { httpProxy, httpsProxy } = getProxyConfig();
      const s3ClientOptions: any = {
        region: region,
        endpoint: endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      };

      const agentConfig: {
        httpAgent?: HttpProxyAgent<string>;
        httpsAgent?: HttpsProxyAgent<string>;
      } = {};

      if (httpProxy) {
        try {
          agentConfig.httpAgent = new HttpProxyAgent<string>(httpProxy);
        } catch (e) {
          console.error('Failed to create HttpProxyAgent:', e);
        }
      }

      if (httpsProxy) {
        try {
          agentConfig.httpsAgent = new HttpsProxyAgent<string>(httpsProxy);
        } catch (e) {
          console.error('Failed to create HttpsProxyAgent:', e);
        }
      }

      if (agentConfig.httpAgent || agentConfig.httpsAgent) {
        s3ClientOptions.requestHandler = new NodeHttpHandler({
          ...(agentConfig.httpAgent && { httpAgent: agentConfig.httpAgent }),
          ...(agentConfig.httpsAgent && { httpsAgent: agentConfig.httpsAgent }),
        });
      }
      const s3ClientTest = new S3Client(s3ClientOptions) as NodeJsClient<S3Client>;
      await s3ClientTest.send(new ListBucketsCommand({}));
      reply.send({ message: 'Connection successful' });
    } catch (error) {
      if (error instanceof S3ServiceException) {
        console.error('S3 Connection Test Error:', error.name, error.message);
        reply.code(error.$metadata?.httpStatusCode || 500).send({
          error: error.name,
          message: error.message,
        });
      } else {
        console.error('Error testing connection (Unknown):', error);
        const err = error as Error;
        reply.code(500).send({
          error: err.name || 'UnknownError',
          message: err.message || 'An unexpected error occurred',
        });
      }
    }
  });

  // Retrieve Hugging Face settings
  fastify.get('/huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const hfToken = getHFConfig();
    const settings = {
      hfToken: hfToken,
    };
    reply.send({ settings });
  });

  // Update Hugging Face settings
  fastify.put('/huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hfToken } = req.body as any;
    try {
      updateHFConfig(hfToken);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating settings', error);
      reply.code(500).send({ error: error.name, message: error.message });
    }
  });

  // Test Hugging Face connection
  fastify.post('/test-huggingface', async (req: FastifyRequest, reply: FastifyReply) => {
    const { hfToken } = req.body as any;
    try {
      const { httpsProxy } = getProxyConfig();
      const axiosOptions: AxiosRequestConfig = {
        headers: {
          Authorization: `Bearer ${hfToken}`,
        },
        proxy: false, // Disable axios default proxy handling
      };

      if (httpsProxy) {
        axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
      }

      const response = await axios.get('https://huggingface.co/api/whoami-v2?', axiosOptions);
      if (response.status === 200) {
        reply.send({
          message: 'Connection successful',
          accessTokenDisplayName: response.data.auth.accessToken.displayName,
        });
      }
    } catch (error) {
      console.log(error);
      reply.code(500).send({
        error: error.response?.data?.error || 'Hugging Face API error',
        message: error.response?.data?.error || 'Error testing Hugging Face connection',
      });
    }
  });

  // Retrieve max concurrent transfers
  fastify.get('/max-concurrent-transfers', async (req: FastifyRequest, reply: FastifyReply) => {
    const maxConcurrentTransfers = getMaxConcurrentTransfers();
    reply.send({ maxConcurrentTransfers });
  });

  // Update max concurrent transfers
  fastify.put('/max-concurrent-transfers', async (req: FastifyRequest, reply: FastifyReply) => {
    const { maxConcurrentTransfers } = req.body as any;
    try {
      updateMaxConcurrentTransfers(maxConcurrentTransfers);
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating settings', error);
      reply.code(500).send({ error: error.name, message: error.message });
    }
  });

  // Retrieve proxy settings
  fastify.get('/proxy', async (req: FastifyRequest, reply: FastifyReply) => {
    const { httpProxy, httpsProxy } = getProxyConfig();
    const settings = {
      httpProxy: httpProxy,
      httpsProxy: httpsProxy,
    };
    reply.send({ settings });
  });

  // Update proxy settings
  fastify.put('/proxy', async (req: FastifyRequest, reply: FastifyReply) => {
    const { httpProxy, httpsProxy } = req.body as any;
    try {
      updateProxyConfig(httpProxy, httpsProxy);
      // Reinitialize the S3 client to apply new proxy settings
      initializeS3Client();
      reply.send({ message: 'Settings updated successfully' });
    } catch (error) {
      console.error('Error updating proxy settings', error);
      const err = error as Error;
      reply.code(500).send({
        error: err.name || 'UnknownError',
        message: err.message || 'An unexpected error occurred',
      });
    }
  });

  // Test proxy connection
  fastify.post('/test-proxy', async (req: FastifyRequest, reply: FastifyReply) => {
    const { httpProxy, httpsProxy, testUrl } = req.body as any;
    console.log('Testing proxy connection with:', {
      httpProxy,
      httpsProxy,
      testUrl,
    });
    let httpAgentInstance;
    let httpsAgentInstance;
    try {
      const url = new URL(testUrl);
      if (url.protocol === 'https:') {
        if (httpsProxy) {
          httpsAgentInstance = new HttpsProxyAgent(httpsProxy);
        }
      } else if (url.protocol === 'http:') {
        if (httpProxy) {
          httpAgentInstance = new HttpProxyAgent(httpProxy);
        }
      }

      const axiosOptions: AxiosRequestConfig = { proxy: false };

      if (httpAgentInstance) {
        axiosOptions.httpAgent = httpAgentInstance;
      }
      if (httpsAgentInstance) {
        axiosOptions.httpsAgent = httpsAgentInstance;
      }

      const response = await axios.get(testUrl, axiosOptions);
      if (response.status >= 200 && response.status < 300) {
        reply.send({ message: 'Connection successful' });
      } else {
        reply
          .code(response.status)
          .send({ message: `Connection failed with status: ${response.status}` });
      }
    } catch (error) {
      console.error('Error testing proxy connection:', error);
      const err = error as Error;

      // Check for response field first (more specific)
      if (error && typeof error === 'object' && 'response' in error && error.response) {
        const axiosResponseError = error as any; // Type assertion
        const status = axiosResponseError.response.status;
        const responseMessage = `Connection failed with status: ${status} - ${
          axiosResponseError.response.statusText || ''
        }`;
        reply
          .code(status || 500) // Ensure status is a number, default to 500 if not
          .send({ error: axiosResponseError.name || 'ProxyTestError', message: responseMessage });
        // Check for request field if no response field (less specific)
      } else if (error && typeof error === 'object' && 'request' in error && error.request) {
        const axiosRequestError = error as any; // Type assertion
        reply.code(500).send({
          error: axiosRequestError.name || 'ProxyTestError',
          message: 'No response received from the server.',
        });
        // Fallback generic error
      } else {
        reply.code(500).send({
          error: err.name || 'ProxyTestError',
          message: err.message || 'An unexpected error occurred',
        });
      }
    }
  });
};
