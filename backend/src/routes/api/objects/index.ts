import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import axios, { AxiosRequestConfig } from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Readable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import {
  getHFConfig,
  getMaxConcurrentTransfers,
  getProxyConfig,
  getS3Config,
} from '../../../utils/config';
import { logAccess } from '../../../utils/logAccess';
import { validatePath } from '../../../utils/localStorage';
import { transferQueue, TransferFileJob } from '../../../utils/transferQueue';
import pLimit from 'p-limit';

const pipelineAsync = promisify(pipeline);

interface UploadProgress {
  loaded: number;
  status: 'idle' | 'queued' | 'uploading' | 'completed';
  total?: number;
}

interface UploadProgresses {
  [key: string]: UploadProgress;
}

type Sibling = {
  rfilename: string;
};

type Siblings = Sibling[];

interface UploadError {
  error: string;
  message: string;
}

interface UploadErrors {
  [key: string]: UploadError;
}

const createRef = (initialValue: any) => {
  return {
    current: initialValue,
  };
};

const abortUploadController = createRef(null);

export default async (fastify: FastifyInstance): Promise<void> => {
  // Server-side listing enhancements configuration
  const DEFAULT_MAX_KEYS = 500; // friendlier cadence for UI
  const MAX_ALLOWED_KEYS = 2000; // hard upper bound
  const MAX_CONTAINS_SCAN_PAGES = 40; // safeguard to avoid runaway scans
  const MAX_QUERY_LENGTH = 256; // validation upper bound for q
  const QUERY_PATTERN = /^[\w.\- @()+=/:]*$/; // conservative allowlist (word chars, dot, dash, space & a few safe symbols)

  interface FilterMeta {
    q?: string;
    mode?: 'startsWith' | 'contains';
    partialResult?: boolean; // true when search stopped before exhausting bucket
    scanPages?: number; // number of S3 pages scanned (contains or broadened)
    scanStoppedReason?: 'maxKeysReached' | 'bucketExhausted' | 'scanCap';
    autoBroaden?: boolean; // true when startsWith broadened to contains
    originalMode?: 'startsWith';
    matches?: {
      objects: Record<string, [number, number][]>;
      prefixes: Record<string, [number, number][]>;
    };
  }

  const normalizeMaxKeys = (raw?: any): number => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return DEFAULT_MAX_KEYS;
    return Math.min(Math.max(1, n), MAX_ALLOWED_KEYS);
  };

  type ListContext = {
    bucket: string;
    prefix?: string; // decoded prefix (may be empty string)
    delimiter?: string;
    continuationToken?: string;
    maxKeys: number;
  };

  const listPage = async (s3Client: S3Client, ctx: ListContext, token?: string): Promise<ListObjectsV2CommandOutput> => {
    const command = new ListObjectsV2Command({
      Bucket: ctx.bucket,
      Prefix: ctx.prefix || undefined,
      Delimiter: ctx.delimiter || '/',
      ContinuationToken: token || ctx.continuationToken || undefined,
      MaxKeys: ctx.maxKeys,
    });
    return s3Client.send(command);
  };

  interface EnhancedResult {
    objects: any[] | undefined;
    prefixes: any[] | undefined;
    nextContinuationToken: string | null;
    isTruncated: boolean;
    filter?: FilterMeta;
  }

  const buildResponse = (reply: FastifyReply, payload: EnhancedResult) => {
    reply.send(payload);
  };

  const applyContainsFilter = (
    Contents: any[] | undefined,
    CommonPrefixes: any[] | undefined,
    qLower: string
  ) => {
    const filteredObjects = Contents?.filter(o => {
      const key: string = o.Key || '';
      const last = key.split('/').pop() || key;
      return last.toLowerCase().includes(qLower);
    });
    const filteredPrefixes = CommonPrefixes?.filter(p => {
      const pref: string = p.Prefix || '';
      const last = pref.endsWith('/') ? pref.slice(0, -1).split('/').pop() : pref.split('/').pop();
      return (last || '').toLowerCase().includes(qLower);
    });
    return { filteredObjects, filteredPrefixes };
  };

  const computeMatchRanges = (leaf: string, qLower: string): [number, number][] => {
    const ranges: [number, number][] = [];
    if (!qLower) return ranges;
    const leafLower = leaf.toLowerCase();
    let idx = 0;
    while (idx <= leafLower.length) {
      const found = leafLower.indexOf(qLower, idx);
      if (found === -1) break;
      ranges.push([found, found + qLower.length]);
      idx = found + 1; // allow overlaps (unlikely needed, but safe)
    }
    return ranges;
  };

  const addMatchMetadata = (objects: any[] | undefined, prefixes: any[] | undefined, qLower: string): FilterMeta['matches'] => {
    const objMatches: Record<string, [number, number][]> = {};
    const prefMatches: Record<string, [number, number][]> = {};
    if (objects) {
      for (const o of objects) {
        const key: string = o.Key || '';
        const leaf = key.split('/').pop() || key;
        const ranges = computeMatchRanges(leaf, qLower);
        if (ranges.length) objMatches[key] = ranges;
      }
    }
    if (prefixes) {
      for (const p of prefixes) {
        const pref: string = p.Prefix || '';
        const leaf = (pref.endsWith('/') ? pref.slice(0, -1) : pref).split('/').pop() || pref;
        const ranges = computeMatchRanges(leaf, qLower);
        if (ranges.length) prefMatches[pref] = ranges;
      }
    }
    return { objects: objMatches, prefixes: prefMatches };
  };

  const runContainsScan = async (
    s3Client: S3Client,
    bucketName: string,
    decoded_prefix: string | undefined,
    continuationToken: string | undefined,
    qLower: string,
    effectiveMaxKeys: number
  ) => {
    let nextToken: string | undefined = continuationToken || undefined;
    let aggregatedObjects: any[] = [];
    let aggregatedPrefixes: any[] = [];
    let underlyingTruncated = false;
    let lastUnderlyingToken: string | undefined = undefined;
    let pagesScanned = 0;

    while (pagesScanned < MAX_CONTAINS_SCAN_PAGES) {
      const page = await s3Client.send(new ListObjectsV2Command({
        Bucket: bucketName,
        Delimiter: '/',
        Prefix: decoded_prefix || undefined,
        ContinuationToken: nextToken,
        MaxKeys: DEFAULT_MAX_KEYS,
      }));
      pagesScanned += 1;
      const { filteredObjects, filteredPrefixes } = applyContainsFilter(page.Contents, page.CommonPrefixes, qLower);
      if (filteredObjects) aggregatedObjects.push(...filteredObjects);
      if (filteredPrefixes) aggregatedPrefixes.push(...filteredPrefixes);
      underlyingTruncated = !!page.IsTruncated;
      lastUnderlyingToken = page.NextContinuationToken || undefined;

      if (aggregatedObjects.length >= effectiveMaxKeys) break; // reached collection goal
      if (!underlyingTruncated || !page.NextContinuationToken) break; // exhausted bucket
      nextToken = page.NextContinuationToken;
    }

    if (aggregatedObjects.length > effectiveMaxKeys) {
      aggregatedObjects = aggregatedObjects.slice(0, effectiveMaxKeys);
    }

    let scanStoppedReason: 'maxKeysReached' | 'bucketExhausted' | 'scanCap';
    if (pagesScanned >= MAX_CONTAINS_SCAN_PAGES && underlyingTruncated && aggregatedObjects.length < effectiveMaxKeys) {
      scanStoppedReason = 'scanCap';
    } else if (aggregatedObjects.length >= effectiveMaxKeys) {
      scanStoppedReason = 'maxKeysReached';
    } else {
      scanStoppedReason = 'bucketExhausted';
    }

    const morePossible = (underlyingTruncated && (aggregatedObjects.length >= effectiveMaxKeys || scanStoppedReason === 'scanCap'));
    const responseToken = morePossible ? (lastUnderlyingToken || null) : null;

    return {
      aggregatedObjects,
      aggregatedPrefixes,
      morePossible,
      responseToken,
      pagesScanned,
      scanStoppedReason,
    };
  };
  const handleListRequest = async (
    req: FastifyRequest,
    reply: FastifyReply,
    bucketName: string,
    decoded_prefix: string | undefined
  ) => {
    logAccess(req);
    const { s3Client } = getS3Config();
    const { continuationToken, q, mode, maxKeys, autoBroaden } = (req.query || {}) as any;

    // Enhanced input validation
    if (bucketName && !/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/.test(bucketName)) {
      reply.code(400).send({
        error: 'InvalidBucketName',
        message: 'Bucket name must be valid S3 bucket name format.',
      });
      return;
    }

    if (continuationToken && (typeof continuationToken !== 'string' || continuationToken.length > 1024)) {
      reply.code(400).send({
        error: 'InvalidContinuationToken',
        message: 'Continuation token is invalid or too long.',
      });
      return;
    }

    if (q) {
      if (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH || !QUERY_PATTERN.test(q)) {
        reply.code(400).send({
          error: 'InvalidQuery',
            message: `Query parameter 'q' is invalid. Max length ${MAX_QUERY_LENGTH}, allowed pattern ${QUERY_PATTERN.toString()}.`,
        });
        return;
      }
    }

    const effectiveMaxKeys = normalizeMaxKeys(maxKeys);
    const requestedMode: 'startsWith' | 'contains' | undefined = q ? (mode === 'startsWith' ? 'startsWith' : 'contains') : undefined;

    if (!q) {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Delimiter: '/',
        Prefix: decoded_prefix || undefined,
        ContinuationToken: continuationToken || undefined,
        MaxKeys: effectiveMaxKeys,
      });
      try {
        const { Contents, CommonPrefixes, NextContinuationToken, IsTruncated } = await s3Client.send(command);
        buildResponse(reply, {
          objects: Contents,
          prefixes: CommonPrefixes,
          nextContinuationToken: NextContinuationToken || null,
          isTruncated: !!IsTruncated,
        });
      } catch (err: any) {
        if (err instanceof S3ServiceException) {
          reply.code(err.$metadata.httpStatusCode || 500).send({
            error: err.name || 'S3ServiceException',
            message: err.message || 'An S3 service exception occurred.',
          });
        } else {
          reply.code(500).send({
            error: err.name || 'Unknown error',
            message: err.message || 'An unexpected error occurred.',
          });
        }
      }
      return;
    }

    const qLower = (q as string).toLowerCase();

    if (requestedMode === 'startsWith') {
      try {
        const command = new ListObjectsV2Command({
          Bucket: bucketName,
          Delimiter: '/',
          Prefix: decoded_prefix || undefined,
          ContinuationToken: continuationToken || undefined,
          MaxKeys: effectiveMaxKeys,
        });
        const { Contents, CommonPrefixes, NextContinuationToken, IsTruncated } = await s3Client.send(command);
        const { filteredObjects, filteredPrefixes } = applyContainsFilter(Contents, CommonPrefixes, qLower);

        const shouldBroaden = autoBroaden === 'true' && (!filteredObjects || filteredObjects.length === 0) && (!filteredPrefixes || filteredPrefixes.length === 0);
        if (shouldBroaden) {
          const scan = await runContainsScan(s3Client, bucketName, decoded_prefix, continuationToken, qLower, effectiveMaxKeys);
          const matches = addMatchMetadata(scan.aggregatedObjects, scan.aggregatedPrefixes, qLower);
          buildResponse(reply, {
            objects: scan.aggregatedObjects,
            prefixes: scan.aggregatedPrefixes,
            nextContinuationToken: scan.responseToken,
            isTruncated: scan.morePossible,
            filter: {
              q,
              mode: 'contains',
              originalMode: 'startsWith',
              autoBroaden: true,
              partialResult: scan.morePossible,
              scanPages: scan.pagesScanned,
              scanStoppedReason: scan.scanStoppedReason,
              matches,
            },
          });
          return;
        }

        const matches = addMatchMetadata(filteredObjects, filteredPrefixes, qLower);
        buildResponse(reply, {
          objects: filteredObjects,
          prefixes: filteredPrefixes,
          nextContinuationToken: NextContinuationToken || null,
          isTruncated: !!IsTruncated,
          filter: { q, mode: 'startsWith', partialResult: false, matches },
        });
      } catch (err: any) {
        if (err instanceof S3ServiceException) {
          reply.code(err.$metadata.httpStatusCode || 500).send({
            error: err.name || 'S3ServiceException',
            message: err.message || 'An S3 service exception occurred.',
          });
        } else {
          reply.code(500).send({
            error: err.name || 'Unknown error',
            message: err.message || 'An unexpected error occurred.',
          });
        }
      }
      return;
    }

    try {
      const scan = await runContainsScan(s3Client, bucketName, decoded_prefix, continuationToken, qLower, effectiveMaxKeys);
      const matches = addMatchMetadata(scan.aggregatedObjects, scan.aggregatedPrefixes, qLower);
      buildResponse(reply, {
        objects: scan.aggregatedObjects,
        prefixes: scan.aggregatedPrefixes,
        nextContinuationToken: scan.responseToken,
        isTruncated: scan.morePossible,
        filter: {
          q,
          mode: 'contains',
          partialResult: scan.morePossible,
          scanPages: scan.pagesScanned,
          scanStoppedReason: scan.scanStoppedReason,
          matches,
        },
      });
    } catch (err: any) {
      if (err instanceof S3ServiceException) {
        reply.code(err.$metadata.httpStatusCode || 500).send({
          error: err.name || 'S3ServiceException',
          message: err.message || 'An S3 service exception occurred.',
        });
      } else {
        reply.code(500).send({
          error: err.name || 'Unknown error',
          message: err.message || 'An unexpected error occurred.',
        });
      }
    }
  };

  fastify.get('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { bucketName } = req.params as any;
    await handleListRequest(req, reply, bucketName, undefined);
  });

  fastify.get('/:bucketName/:prefix', async (req: FastifyRequest, reply: FastifyReply) => {
    const { bucketName, prefix } = req.params as any;
    let decoded_prefix = '';
    if (prefix !== undefined) {
      try { decoded_prefix = atob(prefix); } catch { decoded_prefix = ''; }
    }
    await handleListRequest(req, reply, bucketName, decoded_prefix);
  });

  // Get an object to view it in the client
  fastify.get('/view/:bucketName/:encodedKey', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { s3Client } = getS3Config();
    const { bucketName, encodedKey } = req.params as any;
    const key = atob(encodedKey);

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    try {
      const item = await s3Client.send(command);
      return item.Body;
    } catch (err: any) {
      req.log.error(err);
      if (err instanceof S3ServiceException) {
        reply.status(err.$metadata.httpStatusCode || 500).send({
          error: err.name || 'S3ServiceException',
          message: err.message || 'An S3 service exception occurred.',
        });
      } else {
        reply.status(500).send({
          error: err.name || 'Unknown error',
          message: err.message || 'An unexpected error occurred.',
        });
      }
      return reply;
    }
  });

  // Download an object, streaming it to the client
  fastify.get(
    '/download/:bucketName/:encodedKey',
    async (req: FastifyRequest, reply: FastifyReply) => {
      logAccess(req);
      const { s3Client } = getS3Config();
      const { bucketName, encodedKey } = req.params as any;
      const key = atob(encodedKey);
      const fileName = key.split('/').pop();

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      try {
        const item = await s3Client.send(command);

        const s3Stream = item.Body as Readable;

        // Set the appropriate headers for the response
        reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
        reply.header('Access-Control-Expose-Headers', 'Content-Disposition');
        reply.header('Content-Type', 'application/octet-stream');

        // Pipe the S3 stream to the response
        reply.raw.on('close', () => {
          s3Stream.destroy();
        });

        reply.send(s3Stream);

        return reply;
      } catch (err: any) {
        req.log.error(err);
        if (err instanceof S3ServiceException) {
          reply.status(err.$metadata.httpStatusCode || 500).send({
            error: err.name || 'S3ServiceException',
            message: err.message || 'An S3 service exception occurred.',
          });
        } else {
          reply.status(500).send({
            error: err.name || 'Unknown error',
            message: err.message || 'An unexpected error occurred.',
          });
        }
        return reply;
      }
    },
  );

  // Delete an object or objects with given prefix (folder) from the bucket
  fastify.delete('/:bucketName/:encodedKey', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { s3Client } = getS3Config();
    const { bucketName, encodedKey } = req.params as any;
    const objectName = atob(encodedKey); // This can also be the prefix

    // Check if the objectName is a real object or a prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: objectName,
    });

    try {
      const listResponse = await s3Client.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // If there are multiple objects with the prefix, delete all of them
        const deleteParams = {
          Bucket: bucketName,
          Delete: {
            Objects: listResponse.Contents.map((item: any) => ({ Key: item.Key })),
          },
        };

        const deleteCommand = new DeleteObjectsCommand(deleteParams);
        await s3Client.send(deleteCommand);
        reply.send({ message: 'Objects deleted successfully' });
      } else {
        // If it's a single object, delete it
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: objectName,
        });
        await s3Client.send(deleteCommand);
        reply.send({ message: 'Object deleted successfully' });
      }
    } catch (error: any) {
      if (error instanceof S3ServiceException) {
        reply.code(error.$metadata.httpStatusCode || 500).send({
          error: error.name || 'S3ServiceException',
          message: error.message || 'An S3 service exception occurred.',
        });
      } else {
        reply.code(500).send({
          error: error.name || 'Unknown error',
          message: error.message || 'An unexpected error occurred.',
        });
      }
    }
  });

  // Progress tracking for uploads
  const uploadProgresses: UploadProgresses = {};
  const uploadErrors: UploadErrors = {};

  fastify.get('/upload-progress/:encodedKey', (req: FastifyRequest, reply: FastifyReply) => {
    const { encodedKey } = req.params as any;
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(() => {
      if (uploadProgresses[encodedKey]) {
        sendEvent({
          loaded: uploadProgresses[encodedKey].loaded,
          status: uploadProgresses[encodedKey].status,
        });
        if (uploadProgresses[encodedKey].status === 'completed') {
          console.log('Upload completed for ', encodedKey);
          clearInterval(interval);
          delete uploadProgresses[encodedKey];
          reply.raw.end();
        }
      }
    }, 1000);

    // Handle client disconnect
    req.raw.on('close', () => {
      delete uploadProgresses[encodedKey];
      clearInterval(interval);
    });
  });

  // Abort an ongoing upload
  fastify.get('/abort-upload/:encodedKey', (req: FastifyRequest, reply: FastifyReply) => {
    const { encodedKey } = req.params as any;
    if (abortUploadController.current) {
      (abortUploadController.current as AbortController).abort();
      delete uploadProgresses[encodedKey];
      reply.send({ message: 'Upload aborted' });
    } else {
      reply.send({ message: 'No upload to abort' });
    }
  });

  // Upload an object to a bucket
  fastify.post(
    '/upload/:bucketName/:encodedKey',
    async (req: FastifyRequest, reply: FastifyReply) => {
      logAccess(req);
      const { bucketName, encodedKey } = req.params as any;
      const { s3Client } = getS3Config();
      const key = atob(encodedKey);

      const data = await req.file({
        limits: {
          fileSize: 10 * 1024 * 1024 * 1024, // 10Gb limit
        },
      });

      if (!data) {
        reply.status(400).send({ error: 'File not found', message: 'File not found in request' });
        console.log('File not found in request');
        return;
      }

      const fileStream = data.file;

      abortUploadController.current = new AbortController();

      uploadProgresses[encodedKey] = { loaded: 0, status: 'uploading' };

      const target = {
        Bucket: bucketName,
        Key: key,
        Body: fileStream,
      };

      try {
        const upload = new Upload({
          client: s3Client,
          queueSize: 4, // optional concurrency configuration
          leavePartsOnError: false, // optional manually handle dropped parts
          params: target,
          abortController: abortUploadController.current as AbortController,
        });

        upload.on('httpUploadProgress', (progress: any) => {
          uploadProgresses[encodedKey] = { loaded: progress.loaded || 0, status: 'uploading' };
        });

        await upload.done();
        uploadProgresses[encodedKey] = { loaded: 0, status: 'completed' };
        abortUploadController.current = null;
        reply.send({ message: 'Object uploaded successfully' });
      } catch (e: any) {
        console.log(e);
        abortUploadController.current = null;
        delete uploadProgresses[encodedKey];
        if (e instanceof S3ServiceException) {
          reply.code(e.$metadata.httpStatusCode || 500).send({
            error: e.name || 'S3ServiceException',
            message: e.message || 'An S3 service exception occurred.',
          });
        } else if (e.name === 'AbortError') {
          reply.code(499).send({
            error: e.name || 'AbortError',
            message: e.message || 'Upload aborted by client',
          });
        } else {
          reply.code(500).send({
            error: e.name || 'Unknown error',
            message: e.message || 'An unexpected error occurred.',
          });
        }
      }
    },
  );

  // Model files downloader
  const retrieveModelFile = async (
    s3Client: S3Client,
    bucketName: string,
    prefix: string,
    modelName: string,
    file: Sibling,
  ) => {
    try {
      const auth_headers = { Authorization: `Bearer ${getHFConfig()}` };
      const fileUrl = 'https://huggingface.co/' + modelName + '/resolve/main/' + file.rfilename;

      const { httpProxy, httpsProxy } = getProxyConfig();
      const axiosOptions: AxiosRequestConfig = { headers: auth_headers };

      if (fileUrl.startsWith('https://') && httpsProxy) {
        axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
        axiosOptions.proxy = false;
      } else if (fileUrl.startsWith('http://') && httpProxy) {
        axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
        axiosOptions.proxy = false;
      }

      const response = await axios.head(fileUrl, axiosOptions);
      const fileSize = parseInt(response.headers['content-length'] || '0');

      const streamAxiosOptions: AxiosRequestConfig = { ...axiosOptions, responseType: 'stream' };
      const fileStream = (await axios.get(fileUrl, streamAxiosOptions)).data;

      const target = {
        Bucket: bucketName,
        Key: prefix + modelName + '/' + file.rfilename,
        Body: fileStream,
      };
      // Each model file download should have its own AbortController instance
      const modelAbortController = new AbortController();
      uploadProgresses[file.rfilename] = { loaded: 0, status: 'uploading', total: fileSize };

      const upload = new Upload({
        client: s3Client,
        queueSize: 4, // optional concurrency configuration
        leavePartsOnError: false, // optional manually handle dropped parts
        params: target,
        abortController: modelAbortController, // Use the dedicated controller
      });

      upload.on('httpUploadProgress', (progress: any) => {
        uploadProgresses[file.rfilename] = {
          loaded: progress.loaded || 0,
          status: 'uploading',
          total: fileSize,
        };
      });

      await upload.done();
      uploadProgresses[file.rfilename] = { loaded: fileSize, status: 'completed', total: fileSize };
    } catch (e: any) {
      if (e instanceof S3ServiceException) {
        console.error(`S3 Error uploading ${file.rfilename}: ${e.name} - ${e.message}`);
        uploadErrors[file.rfilename] = {
          error: e.name || 'S3ServiceException',
          message: e.message || `S3 Error uploading ${file.rfilename}: ${e.name} - ${e.message}`,
        };
      } else if (e.name === 'AbortError') {
        console.error(`Upload aborted for ${file.rfilename}`);
        uploadErrors[file.rfilename] = {
          error: e.name || 'AbortError',
          message: e.message || `Upload aborted for ${file.rfilename}`,
        };
      } else {
        console.error(`Error retrieving/uploading ${file.rfilename}: ${e.message}`);
        uploadErrors[file.rfilename] = {
          error: e.name || 'Unknown error',
          message: e.message || `Error retrieving/uploading ${file.rfilename}: ${e.message}`,
        };
      }
      delete uploadProgresses[file.rfilename]; // Ensure progress is cleared on error
      // Optionally, re-throw or handle more specifically if a single file failure should stop the batch
    }
  };

  // Queue manager for model files
  const startModelImport = async (
    modelFiles: Siblings,
    s3Client: S3Client,
    bucketName: string,
    prefix: string,
    modelName: string,
  ) => {
    modelFiles.forEach((file: Sibling) => {
      uploadProgresses[file.rfilename] = { loaded: 0, status: 'queued', total: 0 };
    });
    const limit = pLimit(getMaxConcurrentTransfers());
    const promises = modelFiles.map((file: Sibling) =>
      limit(() => retrieveModelFile(s3Client, bucketName, prefix, modelName, file)),
    );
    try {
      await Promise.all(promises);
    } catch (batchError: any) {
      // This catch block might be hit if p-limit itself throws or if a promise reject isn't caught inside retrieveModelFile
      console.error('Error during model import batch:', batchError);
      // Decide on how to update overall status; individual errors are logged in retrieveModelFile
    }
  };

  // Interface for HuggingFace import request
  interface HuggingFaceImportRequest {
    destinationType?: 's3' | 'local'; // Optional for backward compatibility, defaults to 's3'
    localLocationId?: string; // Required if destinationType === 'local'
    localPath?: string; // Required if destinationType === 'local'
    bucketName?: string; // Required if destinationType === 's3'
    modelId: string;
    hfToken?: string;
    prefix?: string;
  }

  // Helper function to download a HuggingFace file to S3 or local storage
  async function downloadHuggingFaceFile(
    fileJob: TransferFileJob,
    destinationType: 's3' | 'local',
    hfToken: string | undefined,
    onProgress: (loaded: number) => void,
  ): Promise<void> {
    const { sourcePath, destinationPath } = fileJob;

    // Parse destination path
    // Format: "s3:bucketName/path" or "local:locationId/path"
    const colonIndex = destinationPath.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid destination path format: ${destinationPath}`);
    }

    const destRemainder = destinationPath.substring(colonIndex + 1);
    const firstSlash = destRemainder.indexOf('/');
    if (firstSlash === -1) {
      throw new Error(`Invalid destination path format: ${destinationPath}`);
    }

    const destLoc = destRemainder.substring(0, firstSlash);
    const destPath = destRemainder.substring(firstSlash + 1);

    // Fetch from HuggingFace with proxy support
    const { httpProxy, httpsProxy } = getProxyConfig();
    const axiosOptions: AxiosRequestConfig = {
      responseType: 'stream',
      headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {},
    };

    if (sourcePath.startsWith('https://') && httpsProxy) {
      axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
      axiosOptions.proxy = false;
    } else if (sourcePath.startsWith('http://') && httpProxy) {
      axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
      axiosOptions.proxy = false;
    }

    const response = await axios.get(sourcePath, axiosOptions);
    const stream = response.data;

    // Track progress
    let loaded = 0;
    const progressTransform = new Transform({
      transform(chunk, encoding, callback) {
        loaded += chunk.length;
        onProgress(loaded);
        callback(null, chunk);
      },
    });

    // Write to destination
    if (destinationType === 's3') {
      // Upload to S3
      const { s3Client } = getS3Config();
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: destLoc,
          Key: destPath,
          Body: stream.pipe(progressTransform),
        },
      });
      await upload.done();
    } else {
      // Write to local storage
      const absolutePath = await validatePath(destLoc, destPath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });

      // Stream to file
      await pipelineAsync(stream, progressTransform, createWriteStream(absolutePath));
    }
  }

  // New POST route for HuggingFace import with local storage support
  fastify.post<{ Body: HuggingFaceImportRequest }>(
    '/huggingface-import',
    async (req: FastifyRequest, reply: FastifyReply) => {
      logAccess(req);
      const body = req.body as HuggingFaceImportRequest;
      const {
        destinationType = 's3', // Default to 's3' for backward compatibility
        localLocationId,
        localPath,
        bucketName,
        modelId,
        hfToken,
        prefix,
      } = body;

      // Validate destination parameters
      if (destinationType === 's3' && !bucketName) {
        return reply.code(400).send({
          error: 'ValidationError',
          message: 'bucketName is required for S3 destination',
        });
      }

      if (destinationType === 'local') {
        if (!localLocationId || !localPath) {
          return reply.code(400).send({
            error: 'ValidationError',
            message: 'localLocationId and localPath are required for local destination',
          });
        }

        // Validate local path
        try {
          await validatePath(localLocationId, localPath);
        } catch (error: any) {
          return reply.code(400).send({
            error: 'ValidationError',
            message: `Invalid local storage path: ${error.message}`,
          });
        }
      }

      // Fetch model info from HuggingFace
      let modelInfo: any;
      try {
        const { httpProxy, httpsProxy } = getProxyConfig();
        const modelInfoUrl = 'https://huggingface.co/api/models/' + modelId;
        const axiosOptions: AxiosRequestConfig = {
          headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : {},
        };

        if (modelInfoUrl.startsWith('https://') && httpsProxy) {
          axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
          axiosOptions.proxy = false;
        } else if (modelInfoUrl.startsWith('http://') && httpProxy) {
          axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
          axiosOptions.proxy = false;
        }

        modelInfo = await axios.get(modelInfoUrl, axiosOptions);
      } catch (error: any) {
        return reply.code(error.response?.status || 500).send({
          error: error.response?.data?.error || 'HuggingFace API error',
          message: error.response?.data?.error || 'Error fetching model info from HuggingFace',
        });
      }

      // Check if model is gated and user is authorized
      const modelGated = modelInfo.data.gated;
      if (modelGated !== false && hfToken) {
        try {
          const { httpProxy, httpsProxy } = getProxyConfig();
          const whoAmIUrl = 'https://huggingface.co/api/whoami-v2';
          const axiosOptions: AxiosRequestConfig = {
            headers: { Authorization: `Bearer ${hfToken}` },
          };

          if (whoAmIUrl.startsWith('https://') && httpsProxy) {
            axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
            axiosOptions.proxy = false;
          } else if (whoAmIUrl.startsWith('http://') && httpProxy) {
            axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
            axiosOptions.proxy = false;
          }

          await axios.get(whoAmIUrl, axiosOptions);
        } catch (error) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message:
              'This model requires a valid HuggingFace token to be downloaded, or you are not authorized.',
          });
        }
      } else if (modelGated !== false && !hfToken) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'This model is gated and requires a HuggingFace token.',
        });
      }

      // Get model files
      const modelFiles: Siblings = modelInfo.data.siblings;

      // Create transfer jobs
      const files = modelFiles.map((file) => {
        const fileUrl = `https://huggingface.co/${modelId}/resolve/main/${file.rfilename}`;
        const destinationPath =
          destinationType === 's3'
            ? `s3:${bucketName}/${(prefix || '') + modelId}/${file.rfilename}`
            : `local:${localLocationId}/${localPath}/${modelId}/${file.rfilename}`;

        return {
          sourcePath: fileUrl,
          destinationPath,
          size: 0, // Will be tracked during transfer
        };
      });

      // Queue transfer job
      const jobId = transferQueue.queueJob('huggingface', files, async (fileJob, onProgress) => {
        await downloadHuggingFaceFile(fileJob, destinationType, hfToken, onProgress);
      });

      // Return job ID and SSE URL
      // Note: SSE endpoint would be /api/transfer/progress/:jobId from Phase 1.5
      // For now, we return the job ID for tracking
      return reply.send({
        message: 'Model import started',
        jobId,
        sseUrl: `/api/transfer/progress/${jobId}`,
      });
    },
  );

  // Import model from Hugging Face (existing GET route for backward compatibility)
  fastify.get(
    '/hf-import/:bucketName/:encodedPrefix/:encodedModelName',
    async (req: FastifyRequest, reply: FastifyReply) => {
      logAccess(req);
      const { bucketName, encodedPrefix, encodedModelName } = req.params as any;
      let prefix = atob(encodedPrefix);
      prefix = prefix === 'there_is_no_prefix' ? '' : prefix;
      const modelName = atob(encodedModelName);
      const { s3Client } = getS3Config();
      let modelInfo: any = {};
      try {
        const { httpProxy, httpsProxy } = getProxyConfig();
        const modelInfoUrl = 'https://huggingface.co/api/models/' + modelName + '?';
        const axiosOptions: AxiosRequestConfig = {
          headers: {
            Authorization: `Bearer ${getHFConfig()}`,
          },
        };

        if (modelInfoUrl.startsWith('https://') && httpsProxy) {
          axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
          axiosOptions.proxy = false;
        } else if (modelInfoUrl.startsWith('http://') && httpProxy) {
          axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
          axiosOptions.proxy = false;
        }
        modelInfo = await axios.get(modelInfoUrl, axiosOptions);
      } catch (error: any) {
        reply.code(error.response?.status || 500).send({
          error: error.response?.data?.error || 'Hugging Face API error',
          message: error.response?.data?.error || 'Error fetching model info from Hugging Face',
        });
        return;
      }
      const modelGated = modelInfo.data.gated;
      let authorizedUser = true;
      if (modelGated !== false) {
        try {
          const { httpProxy, httpsProxy } = getProxyConfig();
          const whoAmIUrl = 'https://huggingface.co/api/whoami-v2?';
          const axiosOptions: AxiosRequestConfig = {
            headers: {
              Authorization: `Bearer ${getHFConfig()}`,
            },
          };

          if (whoAmIUrl.startsWith('https://') && httpsProxy) {
            axiosOptions.httpsAgent = new HttpsProxyAgent(httpsProxy);
            axiosOptions.proxy = false;
          } else if (whoAmIUrl.startsWith('http://') && httpProxy) {
            axiosOptions.httpAgent = new HttpProxyAgent(httpProxy);
            axiosOptions.proxy = false;
          }
          await axios.get(whoAmIUrl, axiosOptions);
        } catch (error) {
          authorizedUser = false;
        }
      }
      if (!authorizedUser) {
        reply
          .code(401) // Changed to 401 Unauthorized
          .send({
            error: 'Unauthorized',
            message:
              'This model requires a valid HuggingFace token to be downloaded, or you are not authorized. Check your settings.',
          });
        return;
      } else {
        const modelFiles: Siblings = modelInfo.data.siblings;
        startModelImport(modelFiles, s3Client, bucketName, prefix, modelName);
        reply.send({ message: 'Model import started' });
      }
    },
  );

  fastify.get('/import-model-progress', (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(() => {
      if (Object.keys(uploadProgresses).length > 0) {
        sendEvent(uploadProgresses);
      }

      if (Object.keys(uploadErrors).length > 0) {
        sendEvent(uploadErrors);
        // Clear errors after sending
        Object.keys(uploadErrors).forEach((key) => delete uploadErrors[key]);
      }

      const allCompleted = Object.keys(uploadProgresses).map(k => uploadProgresses[k]).every(
        (item: UploadProgress) => item.status === 'completed',
      );
      const noActiveUploads = Object.keys(uploadProgresses).map(k => uploadProgresses[k]).every(
        (item: UploadProgress) => item.status === 'completed' || item.status === 'idle', // Assuming 'idle' means error/not started
      );

      // End stream if all are completed OR if there are no active/queued uploads left (implying errors might have occurred)
      if (Object.keys(uploadProgresses).length > 0 && noActiveUploads) {
        // Check if any were not completed to decide if it was a full success
        const anyNotCompleted = Object.keys(uploadProgresses).map(k => uploadProgresses[k]).some(
          (item: UploadProgress) => item.status !== 'completed',
        );
        if (anyNotCompleted) {
          console.log('Model import process finished, but some files may have failed.');
        } else {
          console.log('All model uploads completed successfully.');
        }

        // Send last errors if any
        if (Object.keys(uploadErrors).length > 0) {
          sendEvent(uploadErrors);
          // Clear errors after sending
          Object.keys(uploadErrors).forEach((key) => delete uploadErrors[key]);
        }

        // Clear the interval and end the stream
        clearInterval(interval);
        Object.keys(uploadProgresses).forEach((key) => delete uploadProgresses[key]);
        reply.raw.end();
        return;
      }
      // If there are no progresses at all, and it wasn't just cleared, also end.
      if (Object.keys(uploadProgresses).length === 0 && !allCompleted) {
        // This case might happen if import started but failed before any progress was made, or client disconnected early
        // Or if all were completed and cleared in a previous tick.
        // To prevent spamming end(), we rely on the check above mostly.
        // However, if it becomes empty and not due to completion, we should also stop.
        // This logic might need refinement based on how `startModelImport` signals overall completion/failure.
        // For now, if it's empty and not all were marked completed in a prior step, assume it's done (possibly with errors).
        console.log('Model import progress stream closing due to no active or pending tasks.');
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1000);

    // Handle client disconnect
    req.raw.on('close', () => {
      console.log('Client disconnected from model import progress.');
      Object.keys(uploadProgresses).forEach((key) => {
        // Here, we don't try to abort S3 uploads as the AbortController was per-file and might be out of scope
        // or the upload might have finished/failed already. Clearing progress is the main action.
        delete uploadProgresses[key];
      });
      clearInterval(interval);
      // reply.raw.end() is implicitly handled by connection close
    });
  });
};
