import { S3Client } from '@aws-sdk/client-s3';
import { NodeJsClient } from '@smithy/types';

// Initial configuration
let accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
let secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
let region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
let endpoint = process.env.AWS_S3_ENDPOINT || '';
let hfToken = process.env.HF_TOKEN || '';
let maxConcurrentTransfers = parseInt(process.env.MAX_CONCURRENT_TRANSFERS || '2', 10);

export const initializeS3Client = (): S3Client => {
  return new S3Client({
    region: region,
    endpoint: endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  }) as NodeJsClient<S3Client>;
};

let s3Client = initializeS3Client();

export const updateS3Config = (
  newAccessKeyId: string,
  newSecretAccessKey: string,
  newRegion: string,
  newEndpoint: string,
): void => {
  accessKeyId = newAccessKeyId;
  secretAccessKey = newSecretAccessKey;
  region = newRegion;
  endpoint = newEndpoint;

  // Reinitialize the S3 client
  s3Client = initializeS3Client();
};

export const getS3Config = (): any => {
  return {
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
    s3Client,
  };
};

export const getHFConfig = (): string => {
  return hfToken;
};

export const updateHFConfig = (newHfToken: string): void => {
  hfToken = newHfToken;
};

export const getMaxConcurrentTransfers = (): number => {
  return maxConcurrentTransfers;
};

export const updateMaxConcurrentTransfers = (newMaxConcurrentTransfers: number): void => {
  maxConcurrentTransfers = newMaxConcurrentTransfers;
};
