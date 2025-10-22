import { FastifyInstance, InjectOptions } from 'fastify';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { vol } from 'memfs';
import { jest } from '@jest/globals';

/**
 * Creates a mock filesystem using memfs
 * Usage: const fs = createMockFilesystem({ '/data/file.txt': 'content' })
 */
export function createMockFilesystem(files: Record<string, string | Buffer> = {}) {
  vol.reset();
  vol.fromJSON(files);
  return vol;
}

/**
 * Creates a mock S3 client for testing
 * Usage: const s3Mock = createMockS3Client()
 */
export function createMockS3Client() {
  const s3Mock = mockClient(S3Client);
  s3Mock.reset();
  return s3Mock;
}

/**
 * Helper for Fastify route testing
 * Usage: const response = await injectRoute(app, { method: 'GET', url: '/api/test' })
 */
export async function injectRoute(app: FastifyInstance, options: InjectOptions) {
  return app.inject(options);
}

/**
 * Creates a temporary test directory structure
 */
export function createTestDirectoryStructure() {
  return {
    '/opt/app-root/src/data': {
      'file1.txt': 'test content 1',
      'file2.txt': 'test content 2',
      subdir: {
        'nested.txt': 'nested content',
      },
    },
    '/opt/app-root/src/models': {
      'model.bin': Buffer.from('binary data'),
    },
  };
}

/**
 * Validates that an error has the expected type and message
 */
export function expectError(fn: () => any, errorType: any, messagePattern?: RegExp) {
  expect(fn).toThrow(errorType);
  if (messagePattern) {
    try {
      fn();
    } catch (error: any) {
      expect(error.message).toMatch(messagePattern);
    }
  }
}

/**
 * Creates a mock transfer queue for testing
 */
export function createMockTransferQueue() {
  const jobs = new Map();
  return {
    queueJob: jest.fn((job) => {
      const id = `job-${Date.now()}`;
      jobs.set(id, job);
      return id;
    }),
    getJob: jest.fn((id) => jobs.get(id)),
    cancelJob: jest.fn((id) => jobs.delete(id)),
    getActiveJobIds: jest.fn(() => Array.from(jobs.keys())),
    jobs,
  };
}

/**
 * Simulates file upload multipart data
 */
export function createMultipartUpload(filename: string, content: string | Buffer) {
  // Implementation for creating multipart form data for file uploads
  return {
    filename,
    mimetype: 'application/octet-stream',
    encoding: '7bit',
    data: content,
  };
}
