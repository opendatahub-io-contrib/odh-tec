import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import axios, { AxiosRequestConfig } from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Readable } from 'stream';
import {
  getHFConfig,
  getMaxConcurrentTransfers,
  getProxyConfig,
  getS3Config,
} from '../../../utils/config';
import { logAccess } from '../../../utils/logAccess';
import pLimit from 'p-limit';

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
  // Get all first-level objects in a bucket (delimiter is /)
  fastify.get('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { s3Client } = getS3Config();
    const { bucketName } = req.params as any;
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: '/',
    });
    try {
      const { Contents, CommonPrefixes } = await s3Client.send(command);
      reply.send({ objects: Contents, prefixes: CommonPrefixes });
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
  });

  // Get all first-level objects in a bucket under a specific prefix
  fastify.get('/:bucketName/:prefix', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { s3Client } = getS3Config();
    const { bucketName, prefix } = req.params as any;
    let decoded_prefix = '';
    if (prefix !== undefined) {
      decoded_prefix = atob(prefix);
    }
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: decoded_prefix,
      Delimiter: '/',
    });
    try {
      const { Contents, CommonPrefixes } = await s3Client.send(command);
      reply.send({ objects: Contents, prefixes: CommonPrefixes });
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

        upload.on('httpUploadProgress', (progress) => {
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

      upload.on('httpUploadProgress', (progress) => {
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

  // Import model from Hugging Face
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

      const allCompleted = Object.values(uploadProgresses).every(
        (item) => item.status === 'completed',
      );
      const noActiveUploads = Object.values(uploadProgresses).every(
        (item) => item.status === 'completed' || item.status === 'idle', // Assuming 'idle' means error/not started
      );

      // End stream if all are completed OR if there are no active/queued uploads left (implying errors might have occurred)
      if (Object.keys(uploadProgresses).length > 0 && noActiveUploads) {
        // Check if any were not completed to decide if it was a full success
        const anyNotCompleted = Object.values(uploadProgresses).some(
          (item) => item.status !== 'completed',
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
