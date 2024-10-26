import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeJsClient } from '@smithy/types';
import axios from 'axios';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import pLimit from 'p-limit';
import { Readable } from 'stream';

import { getHFConfig, getMaxConcurrentTransfers, getS3Config } from '../../../utils/config';

const limit = pLimit(getMaxConcurrentTransfers());

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

const createRef = (initialValue: any) => {
  return {
    current: initialValue,
  };
};

const abortUploadController = createRef(null);

export default async (fastify: FastifyInstance): Promise<void> => {
  // Get all first-level objects in a bucket (delimiter is /)
  fastify.get('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { s3Client } = getS3Config();
    const { bucketName } = req.params as any;
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: '/',
    });
    const { Contents, CommonPrefixes } = await s3Client.send(command);
    reply.send({ objects: Contents, prefixes: CommonPrefixes });
  });

  fastify.get('/:bucketName/:prefix', async (req: FastifyRequest, reply: FastifyReply) => {
    // Get all first-level objects in a bucket under a specific prefix
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
    const { Contents, CommonPrefixes } = await s3Client.send(command);
    reply.send({ objects: Contents, prefixes: CommonPrefixes });
  });

  // Get an object to view it in the client
  fastify.get('/view/:bucketName/:encodedKey', async (req: FastifyRequest, reply: FastifyReply) => {
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
    } catch (err) {
      req.log.error(err);
      reply.status(500).send('Error viewing file');
      return reply;
    }
  });

  // Download an object, streaming it to the client
  fastify.get(
    '/download/:bucketName/:encodedKey',
    async (req: FastifyRequest, reply: FastifyReply) => {
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
      } catch (err) {
        req.log.error(err);
        reply.status(500).send('Error downloading file');
        return reply;
      }
    },
  );

  // Delete an object or objects with given prefix (folder) from the bucket
  fastify.delete('/:bucketName/:encodedKey', async (req: FastifyRequest, reply: FastifyReply) => {
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
    } catch (error) {
      reply.code(500).send({ message: 'Error deleting object(s)', error });
    }
  });

  // Receive a file from the client and upload it to the bucket
  const uploadProgresses: UploadProgresses = {};

  fastify.get('/upload-progress/:encodedKey', (req, reply) => {
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

  fastify.get('/abort-upload/:encodedKey', (req, reply) => {
    const { encodedKey } = req.params as any;
    if (abortUploadController.current) {
      abortUploadController.current.abort();
      delete uploadProgresses[encodedKey];
      reply.send({ message: 'Upload aborted' });
    } else {
      reply.send({ message: 'No upload to abort' });
    }
  });

  fastify.post(
    '/upload/:bucketName/:encodedKey',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { bucketName, encodedKey } = req.params as any;
      const { s3Client } = getS3Config();
      const key = atob(encodedKey);

      const data = await req.file({
        limits: {
          fileSize: 10 * 1024 * 1024 * 1024, // 10Gb limit
        },
      });

      if (!data) {
        reply.status(400).send({ error: 'File not found in request' });
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
          abortController: abortUploadController.current,
        });

        upload.on('httpUploadProgress', (progress) => {
          uploadProgresses[encodedKey] = { loaded: progress.loaded, status: 'uploading' };
        });

        await upload.done();
        uploadProgresses[encodedKey] = { loaded: 0, status: 'completed' };
        //delete uploadProgresses[encodedKey];
        abortUploadController.current = null;
        reply.send({ message: 'Object uploaded successfully' });
      } catch (e) {
        console.log(e);
        abortUploadController.current = null;
        delete uploadProgresses[encodedKey];
      }
    },
  );

  // Model files downloader
  const retrieveModelFile = async (
    s3Client: NodeJsClient<S3Client>,
    bucketName: string,
    prefix: string,
    modelName: string,
    file: Sibling,
  ) => {
    try {
      const auth_headers = { Authorization: `Bearer ${getHFConfig()}` };
      const fileUrl = 'https://huggingface.co/' + modelName + '/resolve/main/' + file.rfilename;
      const response = await axios.head(fileUrl, { headers: auth_headers });
      const fileSize = response.headers['content-length'];
      const fileStream = (
        await axios.get(fileUrl, {
          headers: auth_headers,
          responseType: 'stream',
        })
      ).data;

      const target = {
        Bucket: bucketName,
        Key: prefix + modelName + '/' + file.rfilename,
        Body: fileStream,
      };
      const upload = new Upload({
        client: s3Client,
        queueSize: 4, // optional concurrency configuration
        leavePartsOnError: false, // optional manually handle dropped parts
        params: target,
        abortController: abortUploadController.current,
      });

      upload.on('httpUploadProgress', (progress) => {
        uploadProgresses[file.rfilename] = {
          loaded: progress.loaded,
          status: 'uploading',
          total: fileSize,
        };
      });

      await upload.done();
      uploadProgresses[file.rfilename] = { loaded: fileSize, status: 'completed', total: fileSize };
      abortUploadController.current = null;
    } catch (e) {
      //console.log(e);
      abortUploadController.current = null;
      delete uploadProgresses[file.rfilename];
    }
  };

  // Queue manager for model files
  const startModelImport = async (
    modelFiles: Siblings,
    s3Client: NodeJsClient<S3Client>,
    bucketName: string,
    prefix: string,
    modelName: string,
  ) => {
    modelFiles.forEach((file: Sibling) => {
      uploadProgresses[file.rfilename] = { loaded: 0, status: 'queued', total: 0 };
    });
    const promises = modelFiles.map((file: Sibling) =>
      limit(() => retrieveModelFile(s3Client, bucketName, prefix, modelName, file)),
    );
    await Promise.all(promises);
  };

  // Import model from Hugging Face
  fastify.get(
    '/hf-import/:bucketName/:encodedPrefix/:encodedModelName',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { bucketName, encodedPrefix, encodedModelName } = req.params as any;
      let prefix = atob(encodedPrefix);
      prefix = prefix === 'there_is_no_prefix' ? '' : prefix;
      const modelName = atob(encodedModelName);
      const { s3Client } = getS3Config();
      let modelInfo: any = {};
      try {
        modelInfo = await axios.get('https://huggingface.co/api/models/' + modelName + '?', {
          headers: {
            Authorization: `Bearer ${getHFConfig()}`,
          },
        });
      } catch (error) {
        reply.code(500).send({ message: error.response.data });
      }
      const modelGated = modelInfo.data.gated;
      let authorizedUser = true;
      if (modelGated !== false) {
        try {
          await axios.get('https://huggingface.co/api/whoami-v2?', {
            headers: {
              Authorization: `Bearer ${getHFConfig()}`,
            },
          });
        } catch (error) {
          authorizedUser = false;
        }
      }
      if (!authorizedUser) {
        reply.code(500).send({
          message:
            'This model requires a valid HuggingFace token to be downloaded. Check your settings.',
        });
        return;
      } else {
        const modelFiles: Siblings = modelInfo.data.siblings;
        startModelImport(modelFiles, s3Client, bucketName, prefix, modelName);
        reply.send({ message: 'Model import started' });
      }
    },
  );

  fastify.get('/import-model-progress', (req, reply) => {
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

      if (Object.values(uploadProgresses).every((item) => item.status === 'completed')) {
        console.log('All uploads completed');
        clearInterval(interval);
        reply.raw.end();
      }
    }, 1000);

    // Handle client disconnect
    req.raw.on('close', () => {
      Object.keys(uploadProgresses).forEach((key) => {
        delete uploadProgresses[key];
      });
      clearInterval(interval);
    });
  });
};
