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
let maxFilesPerPage = parseInt(process.env.MAX_FILES_PER_PAGE || '100', 10);
let httpProxy = process.env.HTTP_PROXY || '';
let httpsProxy = process.env.HTTPS_PROXY || '';

// Parse LOCAL_STORAGE_PATHS from environment
// Default: single directory at /opt/app-root/src/data
let localStoragePaths: string[] = process.env.LOCAL_STORAGE_PATHS
  ? process.env.LOCAL_STORAGE_PATHS.split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  : ['/opt/app-root/src/data'];

// Parse MAX_FILE_SIZE_GB from environment
// Default: 20GB
let maxFileSizeGB: number = parseInt(process.env.MAX_FILE_SIZE_GB || '20', 10);

// Validate maxFileSizeGB
if (isNaN(maxFileSizeGB) || maxFileSizeGB <= 0) {
  console.warn(`Invalid MAX_FILE_SIZE_GB: ${process.env.MAX_FILE_SIZE_GB}, using default: 20`);
  maxFileSizeGB = 20;
}

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

export const getMaxFilesPerPage = (): number => {
  return maxFilesPerPage;
};

export const updateMaxFilesPerPage = (newMaxFilesPerPage: number): void => {
  maxFilesPerPage = newMaxFilesPerPage;
};

/**
 * Get configured local storage paths
 * @returns Array of filesystem paths that can be used for local storage
 */
export const getLocalStoragePaths = (): string[] => {
  return [...localStoragePaths]; // Return copy to prevent mutation
};

/**
 * Get maximum file size limit in GB
 * @returns Maximum file size in gigabytes
 */
export const getMaxFileSizeGB = (): number => {
  return maxFileSizeGB;
};

/**
 * Get maximum file size limit in bytes
 * @returns Maximum file size in bytes
 */
export const getMaxFileSizeBytes = (): number => {
  return maxFileSizeGB * 1024 * 1024 * 1024;
};

/**
 * Update local storage paths at runtime (for testing or runtime configuration)
 * @param newPaths - Array of filesystem paths
 */
export const updateLocalStoragePaths = (newPaths: string[]): void => {
  localStoragePaths = newPaths.filter((p) => p.trim().length > 0);
};

/**
 * Update maximum file size limit at runtime
 * @param newLimitGB - New limit in gigabytes
 */
export const updateMaxFileSizeGB = (newLimitGB: number): void => {
  if (newLimitGB > 0 && !isNaN(newLimitGB)) {
    maxFileSizeGB = newLimitGB;
  } else {
    throw new Error(`Invalid file size limit: ${newLimitGB}`);
  }
};

/**
 * Validate a file size against the configured limit
 * @param sizeBytes - File size in bytes
 * @returns true if file size is within limit
 */
export const isFileSizeValid = (sizeBytes: number): boolean => {
  return sizeBytes <= getMaxFileSizeBytes();
};

/**
 * Format file size for error messages
 * @param sizeBytes - File size in bytes
 * @returns Formatted string (e.g., "25.5 GB")
 */
export const formatFileSize = (sizeBytes: number): string => {
  const gb = sizeBytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = sizeBytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = sizeBytes / 1024;
  return `${kb.toFixed(2)} KB`;
};
