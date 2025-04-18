import { FastifyInstance } from 'fastify';
import { S3Client, CreateBucketCommand, ListBucketsCommand, DeleteBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import bucketsRoutes from '../../../../routes/api/buckets';
import { getS3Config } from '../../../../utils/config';
import { S3ServiceException } from '@aws-sdk/client-s3';

// Mock the S3 config
jest.mock('../../../../utils/config', () => ({
  getS3Config: jest.fn(),
}));

describe('Bucket Routes', () => {
  let fastify: FastifyInstance;
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
    (getS3Config as jest.Mock).mockReturnValue({
      s3Client: new S3Client({ region: 'us-east-1' }), // It's a mock, so region is illustrative
      defaultBucket: 'test-default-bucket',
    });

    // Import and register Fastify instance for each test
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Fastify = require('fastify');
    fastify = Fastify();
    fastify.register(bucketsRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should list accessible buckets successfully', async () => {
      s3Mock.on(ListBucketsCommand).resolves({
        Owner: { ID: 'owner-id', DisplayName: 'owner-name' },
        Buckets: [{ Name: 'bucket1' }, { Name: 'bucket2' }],
      });
      s3Mock.on(HeadBucketCommand, { Bucket: 'bucket1' }).resolves({});
      s3Mock.on(HeadBucketCommand, { Bucket: 'bucket2' }).resolves({});

      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.owner).toEqual({ ID: 'owner-id', DisplayName: 'owner-name' });
      expect(payload.defaultBucket).toBe('test-default-bucket');
      expect(payload.buckets).toEqual([{ Name: 'bucket1' }, { Name: 'bucket2' }]);
    });

    it('should filter out inaccessible buckets', async () => {
      s3Mock.on(ListBucketsCommand).resolves({
        Owner: { ID: 'owner-id', DisplayName: 'owner-name' },
        Buckets: [{ Name: 'bucket1' }, { Name: 'inaccessible-bucket' }, { Name: 'bucket2' }],
      });
      s3Mock.on(HeadBucketCommand, { Bucket: 'bucket1' }).resolves({});
      s3Mock.on(HeadBucketCommand, { Bucket: 'inaccessible-bucket' }).rejects(new Error('Access Denied'));
      s3Mock.on(HeadBucketCommand, { Bucket: 'bucket2' }).resolves({});

      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.buckets).toEqual([{ Name: 'bucket1' }, { Name: 'bucket2' }]);
      expect(payload.buckets).not.toContainEqual({ Name: 'inaccessible-bucket' });
    });


    it('should handle S3ServiceException when listing buckets', async () => {
      const s3Error = new S3ServiceException({
        name: 'S3ServiceException',
        $fault: 'client',
        message: "S3 Error",
        $metadata: { httpStatusCode: 403 },
      });
      s3Mock.on(ListBucketsCommand).rejects(s3Error);


      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('S3ServiceException');
      expect(payload.message).toBe('S3 Error');
    });

    it('should handle other errors when listing buckets', async () => {
      s3Mock.on(ListBucketsCommand).rejects(new Error('Some other error'));

      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Error');
      expect(payload.message).toBe('Some other error');
    });
  });

  describe('POST /', () => {
    it('should create a bucket successfully', async () => {
      s3Mock.on(CreateBucketCommand).resolves({
        $metadata: { httpStatusCode: 200 },
        Location: 'test-bucket',
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { bucketName: 'test-bucket' },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toBe('Bucket created successfully');
      expect(payload.data.Location).toBe('test-bucket');
    });

    it('should handle S3ServiceException when creating a bucket', async () => {
      const s3Error = new S3ServiceException({
        name: 'S3ServiceException',
        $fault: 'client',
        message: "S3 Create Error",
        $metadata: { httpStatusCode: 409 },
      });
      s3Mock.on(CreateBucketCommand).rejects(s3Error);

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { bucketName: 'test-bucket' },
      });

      expect(response.statusCode).toBe(409);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('S3ServiceException');
      expect(payload.message).toBe('S3 Create Error');
    });

     it('should handle other errors when creating a bucket', async () => {
      s3Mock.on(CreateBucketCommand).rejects(new Error('Some other create error'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { bucketName: 'test-bucket' },
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Error');
      expect(payload.message).toBe('Some other create error');
    });
  });

  describe('DELETE /:bucketName', () => {
    it('should delete a bucket successfully', async () => {
      s3Mock.on(DeleteBucketCommand).resolves({
        $metadata: { httpStatusCode: 200 },
      });

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/test-bucket-to-delete',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toBe('Bucket deleted successfully');
    });

    it('should handle S3ServiceException when deleting a bucket', async () => {
      const s3Error = new S3ServiceException({
        name: 'S3ServiceException',
        $fault: 'client',
        message: "S3 Delete Error",
        $metadata: { httpStatusCode: 404 },
      });
      s3Mock.on(DeleteBucketCommand).rejects(s3Error);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/test-bucket-to-delete',
      });

      expect(response.statusCode).toBe(404);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('S3ServiceException');
      expect(payload.message).toBe('S3 Delete Error');
    });

    it('should handle other errors when deleting a bucket', async () => {
      s3Mock.on(DeleteBucketCommand).rejects(new Error('Some other delete error'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/test-bucket-to-delete',
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Error');
      expect(payload.message).toBe('Some other delete error');
    });
  });
}); 