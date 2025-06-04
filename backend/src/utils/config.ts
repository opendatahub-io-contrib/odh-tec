import { S3Client } from '@aws-sdk/client-s3';
import { NodeJsClient } from '@smithy/types';
import { NodeHttpHandler } from '@aws-sdk/node-http-handler';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Initial configuration
let accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
let region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
let endpoint = process.env.AWS_S3_ENDPOINT || '';
let defaultBucket = process.env.AWS_S3_BUCKET || '';
let hfToken = process.env.HF_TOKEN || '';
let maxConcurrentTransfers = parseInt(process.env.MAX_CONCURRENT_TRANSFERS || '2', 10);
let httpProxy = process.env.HTTP_PROXY || '';
let httpsProxy = process.env.HTTPS_PROXY || '';

export const initializeS3Client = (): S3Client => {
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
  return new S3Client(s3ClientOptions) as NodeJsClient<S3Client>;
};

let s3Client = initializeS3Client();

export const updateS3Config = (
  newAccessKeyId: string,
  newSecretAccessKey: string,
  newRegion: string,
  newEndpoint: string,
  newDefaultBucket: string,
): void => {
  accessKeyId = newAccessKeyId;
  secretAccessKey = newSecretAccessKey;
  region = newRegion;
  endpoint = newEndpoint;
  defaultBucket = newDefaultBucket;

  // Reinitialize the S3 client
  s3Client = initializeS3Client();
};

export const getS3Config = (): any => {
  return {
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
    defaultBucket,
    s3Client,
  };
};

export const getHFConfig = (): string => {
  return hfToken;
};

export const updateHFConfig = (newHfToken: string): void => {
  hfToken = newHfToken;
};

export const getProxyConfig = (): { httpProxy: string; httpsProxy: string } => {
  return {
    httpProxy,
    httpsProxy,
  };
};

export const updateProxyConfig = (newHttpProxy: string, newHttpsProxy: string): void => {
  httpProxy = newHttpProxy;
  httpsProxy = newHttpsProxy;
  // Reinitialize clients that depend on proxy settings
  s3Client = initializeS3Client();
};

export const getMaxConcurrentTransfers = (): number => {
  return maxConcurrentTransfers;
};

export const updateMaxConcurrentTransfers = (newMaxConcurrentTransfers: number): void => {
  maxConcurrentTransfers = newMaxConcurrentTransfers;
};
