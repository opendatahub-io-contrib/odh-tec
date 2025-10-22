// Import memfs and configure mocks
import { vol } from 'memfs';

// Mock fs/promises and fs with memfs
jest.mock('fs/promises', () => {
  const { fs } = require('memfs');
  return fs.promises;
});

jest.mock('fs', () => {
  const { fs } = require('memfs');
  return fs;
});

// Mock S3 client
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const s3Mock = mockClient(S3Client);

// Mock config module
const mockGetS3Config = jest.fn();
const mockGetLocalStoragePaths = jest.fn();
const mockGetMaxConcurrentTransfers = jest.fn();

jest.mock('../../../../utils/config', () => ({
  getS3Config: mockGetS3Config,
  getLocalStoragePaths: mockGetLocalStoragePaths,
  getMaxConcurrentTransfers: mockGetMaxConcurrentTransfers,
  updateLocalStoragePaths: jest.fn((paths: string[]) => {
    mockGetLocalStoragePaths.mockReturnValue([...paths]);
  }),
}));

// Mock transferQueue
const mockTransferQueue = {
  queueJob: jest.fn(),
  getJob: jest.fn(),
  cancelJob: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock('../../../../utils/transferQueue', () => ({
  transferQueue: mockTransferQueue,
  TransferFileJob: jest.fn(),
  TransferJob: jest.fn(),
}));

import Fastify, { FastifyInstance } from 'fastify';
import transferRoutes from '../../../../routes/api/transfer';
import { updateLocalStoragePaths } from '../../../../utils/config';
import { Readable } from 'stream';

describe('Transfer API Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(transferRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vol.reset();
    s3Mock.reset();
    jest.clearAllMocks();

    // Setup default mocks
    updateLocalStoragePaths(['/opt/app-root/src/data', '/opt/app-root/src/models']);
    mockGetMaxConcurrentTransfers.mockReturnValue(2);
    mockGetS3Config.mockReturnValue({
      s3Client: new S3Client({}),
      accessKeyId: 'test',
      secretAccessKey: 'test',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      defaultBucket: 'test-bucket',
    });

    // Create mock filesystem
    vol.mkdirSync('/opt/app-root/src/data', { recursive: true });
    vol.mkdirSync('/opt/app-root/src/models', { recursive: true });
    vol.writeFileSync('/opt/app-root/src/data/file1.txt', 'content1');
    vol.writeFileSync('/opt/app-root/src/data/file2.txt', 'content2');
  });

  describe('POST /api/transfer', () => {
    it('should create transfer job and return jobId and SSE URL', async () => {
      const jobId = 'transfer-123';
      mockTransferQueue.queueJob.mockReturnValue(jobId);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: {
            type: 's3',
            locationId: 'source-bucket',
            path: 'models',
          },
          destination: {
            type: 'local',
            locationId: 'local-0',
            path: 'data',
          },
          files: ['model1.bin', 'model2.bin'],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.jobId).toBe(jobId);
      expect(payload.sseUrl).toBe(`/progress/${jobId}`);
      expect(mockTransferQueue.queueJob).toHaveBeenCalledWith(
        'cross-storage',
        expect.arrayContaining([
          expect.objectContaining({
            sourcePath: expect.stringContaining('s3:source-bucket'),
            destinationPath: expect.stringContaining('local:local-0'),
          }),
        ]),
        expect.any(Function),
      );
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: { type: 's3', locationId: 'bucket', path: '' },
          // Missing destination, files, conflictResolution
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Missing required fields');
    });

    it('should return 400 when no files specified', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: { type: 's3', locationId: 'bucket', path: '' },
          destination: { type: 'local', locationId: 'local-0', path: '' },
          files: [],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('No files specified');
    });

    it('should handle S3 to S3 transfer request', async () => {
      const jobId = 'transfer-456';
      mockTransferQueue.queueJob.mockReturnValue(jobId);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: {
            type: 's3',
            locationId: 'source-bucket',
            path: 'path/to/files',
          },
          destination: {
            type: 's3',
            locationId: 'dest-bucket',
            path: 'new/path',
          },
          files: ['file.txt'],
          conflictResolution: 'skip',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTransferQueue.queueJob).toHaveBeenCalled();
    });

    it('should handle local to local transfer request', async () => {
      const jobId = 'transfer-789';
      mockTransferQueue.queueJob.mockReturnValue(jobId);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: {
            type: 'local',
            locationId: 'local-0',
            path: 'data',
          },
          destination: {
            type: 'local',
            locationId: 'local-1',
            path: 'models',
          },
          files: ['file1.txt'],
          conflictResolution: 'rename',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTransferQueue.queueJob).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockTransferQueue.queueJob.mockImplementation(() => {
        throw new Error('Queue error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: { type: 's3', locationId: 'bucket', path: '' },
          destination: { type: 'local', locationId: 'local-0', path: '' },
          files: ['file.txt'],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Queue error');
    });
  });

  describe('GET /api/transfer/progress/:jobId', () => {
    it('should return 404 for non-existent job', async () => {
      mockTransferQueue.getJob.mockReturnValue(undefined);

      const response = await app.inject({
        method: 'GET',
        url: '/progress/non-existent-job',
      });

      // SSE endpoint will send error event and close
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.payload).toContain('Job not found');
    });

    it('should set correct SSE headers', async () => {
      // Use completed job so stream closes immediately
      mockTransferQueue.getJob.mockReturnValue({
        id: 'job-123',
        type: 'cross-storage',
        status: 'completed',
        files: [],
        progress: {
          totalFiles: 0,
          completedFiles: 0,
          failedFiles: 0,
          totalBytes: 0,
          loadedBytes: 0,
          percentage: 100,
        },
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // Simulate immediate completion event
      setTimeout(() => {
        const listener = mockTransferQueue.on.mock.calls.find((call) => call[0] === 'job-updated');
        if (listener && listener[1]) {
          listener[1]({
            id: 'job-123',
            status: 'completed',
            files: [],
            progress: { percentage: 100 },
          });
        }
      }, 10);

      const response = await app.inject({
        method: 'GET',
        url: '/progress/job-123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    }, 10000);

    it('should send initial job state', async () => {
      // Use completed job so stream closes
      const mockJob = {
        id: 'job-123',
        type: 'cross-storage',
        status: 'completed',
        files: [
          {
            sourcePath: 's3:bucket/file.txt',
            destinationPath: 'local:local-0/file.txt',
            size: 1000,
            loaded: 1000,
            status: 'completed',
          },
        ],
        progress: {
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 0,
          totalBytes: 1000,
          loadedBytes: 1000,
          percentage: 100,
        },
        createdAt: new Date(),
        completedAt: new Date(),
      };

      mockTransferQueue.getJob.mockReturnValue(mockJob);

      // Simulate immediate completion
      setTimeout(() => {
        const listener = mockTransferQueue.on.mock.calls.find((call) => call[0] === 'job-updated');
        if (listener && listener[1]) {
          listener[1](mockJob);
        }
      }, 10);

      const response = await app.inject({
        method: 'GET',
        url: '/progress/job-123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.payload).toContain('data:');
      expect(response.payload).toContain('job-123');
      expect(response.payload).toContain('completed');
    }, 10000);

    it('should register event listener', async () => {
      // Use completed job so stream closes
      mockTransferQueue.getJob.mockReturnValue({
        id: 'job-123',
        type: 'cross-storage',
        status: 'completed',
        files: [],
        progress: {
          totalFiles: 0,
          completedFiles: 0,
          failedFiles: 0,
          totalBytes: 0,
          loadedBytes: 0,
          percentage: 100,
        },
        createdAt: new Date(),
        completedAt: new Date(),
      });

      // Simulate immediate completion
      setTimeout(() => {
        const listener = mockTransferQueue.on.mock.calls.find((call) => call[0] === 'job-updated');
        if (listener && listener[1]) {
          listener[1]({
            id: 'job-123',
            status: 'completed',
            files: [],
            progress: { percentage: 100 },
          });
        }
      }, 10);

      await app.inject({
        method: 'GET',
        url: '/progress/job-123',
      });

      expect(mockTransferQueue.on).toHaveBeenCalledWith('job-updated', expect.any(Function));
    }, 10000);
  });

  describe('DELETE /api/transfer/:jobId', () => {
    it('should cancel job successfully', async () => {
      mockTransferQueue.cancelJob.mockReturnValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: '/job-123',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.cancelled).toBe(true);
      expect(mockTransferQueue.cancelJob).toHaveBeenCalledWith('job-123');
    });

    it('should return false for non-existent job', async () => {
      mockTransferQueue.cancelJob.mockReturnValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: '/non-existent',
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.cancelled).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockTransferQueue.cancelJob.mockImplementation(() => {
        throw new Error('Cancel error');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/job-123',
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Cancel error');
    });
  });

  describe('POST /api/transfer/check-conflicts', () => {
    it('should detect conflicts for local destinations', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: {
            type: 'local',
            locationId: 'local-0',
            path: '',
          },
          files: ['file1.txt', 'file2.txt', 'nonexistent.txt'],
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.conflicts).toContain('file1.txt');
      expect(payload.conflicts).toContain('file2.txt');
      expect(payload.conflicts).not.toContain('nonexistent.txt');
    });

    it('should detect conflicts for S3 destinations', async () => {
      // Mock S3 HeadObject to indicate file exists
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1000,
        LastModified: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'models',
          },
          files: ['existing-model.bin'],
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.conflicts).toContain('existing-model.bin');
    });

    it('should return empty array when no conflicts', async () => {
      // Mock S3 HeadObject to throw NotFound
      s3Mock.on(HeadObjectCommand).rejects({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'models',
          },
          files: ['new-model.bin'],
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.conflicts).toEqual([]);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          // Missing destination and files
        },
      });

      expect(response.statusCode).toBe(400);
      const payload = JSON.parse(response.payload);
      expect(payload.error).toBe('Missing required fields');
    });

    it('should handle errors gracefully', async () => {
      // Mock S3 to throw an error
      s3Mock.on(HeadObjectCommand).rejects(new Error('S3 error'));

      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'models',
          },
          files: ['file.bin'],
        },
      });

      // Should succeed but with empty conflicts (errors are caught)
      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(Array.isArray(payload.conflicts)).toBe(true);
    });

    it('should handle mixed existing and non-existing files', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: {
            type: 'local',
            locationId: 'local-0',
            path: '',
          },
          files: ['file1.txt', 'nonexistent1.txt', 'file2.txt', 'nonexistent2.txt'],
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.conflicts).toHaveLength(2);
      expect(payload.conflicts).toContain('file1.txt');
      expect(payload.conflicts).toContain('file2.txt');
    });
  });

  describe('Transfer Functions (Integration)', () => {
    it('should pass executor function to queue', async () => {
      const jobId = 'transfer-123';
      mockTransferQueue.queueJob.mockReturnValue(jobId);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: {
            type: 's3',
            locationId: 'source-bucket',
            path: 'models',
          },
          destination: {
            type: 'local',
            locationId: 'local-0',
            path: 'data',
          },
          files: ['model.bin'],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTransferQueue.queueJob).toHaveBeenCalledWith(
        'cross-storage',
        expect.any(Array),
        expect.any(Function),
      );
    });

    it('should create jobs with all conflict resolution strategies', async () => {
      const strategies = ['skip', 'rename', 'overwrite'];

      for (const strategy of strategies) {
        jest.clearAllMocks();
        mockTransferQueue.queueJob.mockReturnValue('job-id');

        const response = await app.inject({
          method: 'POST',
          url: '/',
          payload: {
            source: {
              type: 'local',
              locationId: 'local-0',
              path: 'data',
            },
            destination: {
              type: 'local',
              locationId: 'local-1',
              path: 'models',
            },
            files: ['file1.txt'],
            conflictResolution: strategy,
          },
        });

        expect(response.statusCode).toBe(200);
        expect(mockTransferQueue.queueJob).toHaveBeenCalled();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid transfer path format', async () => {
      // This would be caught during execution, not at route level
      // The route accepts the request, errors happen during transfer
      const jobId = 'transfer-123';
      mockTransferQueue.queueJob.mockReturnValue(jobId);

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: {
            type: 's3',
            locationId: 'bucket',
            path: 'path',
          },
          destination: {
            type: 'local',
            locationId: 'local-0',
            path: 'data',
          },
          files: ['file.txt'],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockTransferQueue.queueJob).toHaveBeenCalled();
    });

    it('should return proper error structure', async () => {
      mockTransferQueue.queueJob.mockImplementation(() => {
        throw new Error('Test error');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: {
          source: { type: 's3', locationId: 'bucket', path: '' },
          destination: { type: 'local', locationId: 'local-0', path: '' },
          files: ['file.txt'],
          conflictResolution: 'overwrite',
        },
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload).toHaveProperty('error');
      expect(typeof payload.error).toBe('string');
    });
  });
});
