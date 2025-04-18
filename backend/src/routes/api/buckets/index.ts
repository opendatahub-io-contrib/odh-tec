import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  HeadBucketCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';

import { getS3Config } from '../../../utils/config';

export default async (fastify: FastifyInstance): Promise<void> => {
  // Retrieve all accessible buckets
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { s3Client, defaultBucket } = getS3Config();
    const command = new ListBucketsCommand({});

    try {
      const { Owner, Buckets } = await s3Client.send(command);

      // Filter buckets to only include those we can access
      const accessibleBuckets = [];
      if (Buckets) {
        for (const bucket of Buckets) {
          try {
            // Try to access bucket metadata - will throw if no access
            await s3Client.send(new HeadBucketCommand({ Bucket: bucket.Name }));
            accessibleBuckets.push(bucket);
          } catch (bucketError) {
            // Skip buckets we don't have access to
            console.log(`No access to bucket: ${bucket.Name}`);
          }
        }
      }

      reply.send({
        owner: Owner,
        defaultBucket: defaultBucket,
        buckets: accessibleBuckets,
      });
    } catch (error) {
      if (error instanceof S3ServiceException) {
        console.error(`S3 error listing buckets: ${error.name} - ${error.message}`);
        const statusCode = error.$metadata?.httpStatusCode || 500;
        reply.code(statusCode).send({
          error: error.name || 'S3ServiceException',
          message: error.message || 'An S3 service exception occurred.',
        });
      } else {
        console.error('Error listing buckets', error);
        reply.code(500).send({
          error: error.name || 'Unknown error',
          message: error.message || 'An unexpected error occurred.',
        });
      }
    }
  });

  // Create a new bucket
  fastify.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const { s3Client } = getS3Config();
    const { bucketName } = req.body as any;
    const createBucketCommand = new CreateBucketCommand({
      Bucket: bucketName,
    });

    try {
      const data = await s3Client.send(createBucketCommand);
      reply.send({ message: 'Bucket created successfully', data });
    } catch (error) {
      if (error instanceof S3ServiceException) {
        console.error(`S3 error creating bucket: ${error.name} - ${error.message}`);
        const statusCode = error.$metadata?.httpStatusCode || 500;
        reply.code(statusCode).send({
          error: error.name || 'S3ServiceException',
          message: error.message || 'An S3 service exception occurred.',
        });
      } else {
        console.error('Error creating bucket', error);
        reply.code(500).send({
          error: error.name || 'Unknown error',
          message: error.message || 'An unexpected error occurred.',
        });
      }
    }
  });

  // Delete a bucket
  fastify.delete('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { s3Client } = getS3Config();
    const { bucketName } = req.params as any;

    const deleteBucketCommand = new DeleteBucketCommand({
      Bucket: bucketName,
    });

    try {
      await s3Client.send(deleteBucketCommand);
      reply.send({ message: 'Bucket deleted successfully' });
    } catch (error) {
      if (error instanceof S3ServiceException) {
        console.error(`S3 error deleting bucket: ${error.name} - ${error.message}`);
        const statusCode = error.$metadata?.httpStatusCode || 500;
        reply.code(statusCode).send({
          error: error.name || 'S3ServiceException',
          message: error.message || 'An S3 service exception occurred.',
        });
      } else {
        console.error('Error deleting bucket', error);
        reply.code(500).send({
          error: error.name || 'Unknown error',
          message: error.message || 'An unexpected error occurred.',
        });
      }
    }
  });
};
