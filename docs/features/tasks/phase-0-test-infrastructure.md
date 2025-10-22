# Phase 0: Test Infrastructure Setup

> **Task ID**: phase-0
> **Estimated Effort**: 2-3 days
> **Dependencies**: None (foundation for all other phases)

## Objective

Set up comprehensive test infrastructure for both backend and frontend to support test-driven development throughout the PVC storage feature implementation. This includes filesystem mocking, S3 client mocking, Fastify test helpers, PatternFly component testing utilities, and SSE EventSource mocking.

## Prerequisites

- None - this is the foundational phase
- Ensure dev dependencies are installed: `npm install` in root, backend, and frontend

## Files to Create

### Backend

- `backend/src/__tests__/utils/testHelpers.ts` - Main test utilities
- `backend/src/__tests__/utils/fixtures.ts` - Test data fixtures

### Frontend

- `frontend/src/__tests__/utils/testHelpers.ts` - Component test utilities
- `frontend/src/__tests__/utils/fixtures.ts` - Test data fixtures

## Implementation Steps

### Step 1: Backend Test Utilities

Create `backend/src/__tests__/utils/testHelpers.ts`:

```typescript
import { FastifyInstance } from 'fastify';
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
export async function injectRoute(
  app: FastifyInstance,
  options: {
    method: string;
    url: string;
    payload?: any;
    headers?: Record<string, string>;
  },
) {
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
```

Create `backend/src/__tests__/utils/fixtures.ts`:

```typescript
/**
 * Path validation attack vectors for security testing
 */
export const PATH_TRAVERSAL_ATTACKS = [
  '../../../etc/passwd',
  '..%2F..%2F..%2Fetc%2Fpasswd',
  '..\\..\\..\\windows\\system32',
  'test\x00hidden',
  '/etc/passwd',
  '~/../../etc/passwd',
  'test/../../../etc/passwd',
  'test/../../',
  './../../etc/passwd',
  // Unicode normalization attacks
  'test\u002e\u002e/etc',
  // Null byte injection
  'file.txt\x00.exe',
  // Windows-specific
  'C:\\Windows\\System32',
  '\\\\server\\share',
];

/**
 * Valid relative paths that should pass validation
 */
export const VALID_RELATIVE_PATHS = [
  'file.txt',
  'subdir/file.txt',
  'deep/nested/path/file.txt',
  'file-with-dashes.txt',
  'file_with_underscores.txt',
  'file.multiple.dots.txt',
  '.',
  '',
];

/**
 * Sample storage locations for testing
 */
export const MOCK_STORAGE_LOCATIONS = [
  {
    id: 'local-0',
    name: 'Data Storage',
    path: '/opt/app-root/src/data',
    type: 'local' as const,
    available: true,
  },
  {
    id: 'local-1',
    name: 'Model Storage',
    path: '/opt/app-root/src/models',
    type: 'local' as const,
    available: true,
  },
  {
    id: 'local-2',
    name: 'Unavailable Storage',
    path: '/mnt/missing',
    type: 'local' as const,
    available: false,
  },
];

/**
 * Sample file entries for testing
 */
export const MOCK_FILE_ENTRIES = [
  {
    name: 'document.txt',
    path: 'document.txt',
    type: 'file' as const,
    size: 1024,
    modified: '2025-10-23T10:00:00Z',
  },
  {
    name: 'images',
    path: 'images',
    type: 'directory' as const,
  },
  {
    name: 'link-to-file',
    path: 'link-to-file',
    type: 'symlink' as const,
    target: 'document.txt',
  },
];

/**
 * Sample transfer job for testing
 */
export const MOCK_TRANSFER_JOB = {
  id: 'job-123',
  type: 'cross-storage' as const,
  status: 'active' as const,
  files: [
    {
      sourcePath: 'local-0/file1.txt',
      destinationPath: 's3-bucket/file1.txt',
      size: 1024,
      loaded: 512,
      status: 'transferring' as const,
    },
  ],
  progress: {
    totalFiles: 1,
    completedFiles: 0,
    totalBytes: 1024,
    loadedBytes: 512,
    percentage: 50,
  },
};
```

### Step 2: Frontend Test Utilities

Create `frontend/src/__tests__/utils/testHelpers.tsx`:

```typescript
import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

/**
 * Custom render function that includes common providers
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * Creates an axios mock adapter for API testing
 */
export function createAxiosMock() {
  return new MockAdapter(axios);
}

/**
 * Mock EventSource for SSE testing
 */
export class MockEventSource {
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState: number = 0;
  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = this.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  close() {
    this.readyState = this.CLOSED;
  }

  // Test helper to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      const event = new MessageEvent('message', {
        data: JSON.stringify(data)
      });
      this.onmessage(event);
    }
  }

  // Test helper to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

/**
 * Replace global EventSource with mock
 */
export function setupEventSourceMock() {
  (global as any).EventSource = MockEventSource;
}

/**
 * Restore original EventSource
 */
export function teardownEventSourceMock() {
  delete (global as any).EventSource;
}

/**
 * Wait for async updates in tests
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Simulate file selection in input
 */
export function createMockFile(
  name: string,
  size: number,
  type: string = 'text/plain'
): File {
  const blob = new Blob(['a'.repeat(size)], { type });
  return new File([blob], name, { type });
}

/**
 * Mock storage service
 */
export function createMockStorageService() {
  return {
    getLocations: jest.fn(),
    listFiles: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    deleteFile: jest.fn(),
    createDirectory: jest.fn(),
    checkConflicts: jest.fn(),
    initiateTransfer: jest.fn(),
    cancelTransfer: jest.fn()
  };
}
```

Create `frontend/src/__tests__/utils/fixtures.ts`:

```typescript
import { StorageLocation, FileEntry, TransferConflict } from '../../app/services/storageService';

/**
 * Mock storage locations for testing
 */
export const MOCK_STORAGE_LOCATIONS: StorageLocation[] = [
  {
    id: 's3-test-bucket',
    name: 'test-bucket',
    type: 's3',
    available: true,
    region: 'us-east-1',
  },
  {
    id: 'local-0',
    name: 'Data Storage',
    type: 'local',
    available: true,
    path: '/opt/app-root/src/data',
  },
  {
    id: 'local-1',
    name: 'Model Storage',
    type: 'local',
    available: true,
    path: '/opt/app-root/src/models',
  },
  {
    id: 'local-2',
    name: 'Unavailable Storage',
    type: 'local',
    available: false,
    path: '/mnt/missing',
  },
];

/**
 * Mock file entries for testing
 */
export const MOCK_FILE_ENTRIES: FileEntry[] = [
  {
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    size: 2048,
    modified: new Date('2025-10-20T10:00:00Z'),
  },
  {
    name: 'data',
    path: 'data',
    type: 'directory',
  },
  {
    name: 'model.bin',
    path: 'model.bin',
    type: 'file',
    size: 7516192768, // 7GB
    modified: new Date('2025-10-22T15:30:00Z'),
  },
  {
    name: 'link',
    path: 'link',
    type: 'symlink',
    target: 'data/actual-file.txt',
  },
];

/**
 * Mock transfer conflicts for testing
 */
export const MOCK_TRANSFER_CONFLICTS: TransferConflict[] = [
  {
    path: 'existing-file.txt',
    existingSize: 1024,
    existingModified: new Date('2025-10-15T08:00:00Z'),
  },
  {
    path: 'another-file.pdf',
    existingSize: 5120,
    existingModified: new Date('2025-10-18T12:00:00Z'),
  },
];

/**
 * Mock SSE transfer progress events
 */
export const MOCK_SSE_EVENTS = [
  {
    file: 'file1.txt',
    loaded: 0,
    total: 1024,
    status: 'queued',
  },
  {
    file: 'file1.txt',
    loaded: 512,
    total: 1024,
    status: 'transferring',
  },
  {
    file: 'file1.txt',
    loaded: 1024,
    total: 1024,
    status: 'completed',
  },
];
```

### Step 3: Install Testing Dependencies

Ensure these are in `backend/package.json` devDependencies:

```json
{
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "@types/jest": "^29.5.11",
    "aws-sdk-client-mock": "^3.0.0",
    "jest": "^29.7.0",
    "memfs": "^4.6.0",
    "ts-jest": "^29.1.1"
  }
}
```

And in `frontend/package.json` devDependencies:

```json
{
  "devDependencies": {
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/user-event": "^14.5.1",
    "axios-mock-adapter": "^1.22.0",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0"
  }
}
```

### Step 4: Configure Jest

Ensure `backend/jest.config.js` includes:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/__tests__/**'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

And `frontend/jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/__tests__/**'],
};
```

## Acceptance Criteria

- [ ] Backend test helpers successfully create mock filesystems
- [ ] S3 client mocking works with aws-sdk-client-mock
- [ ] Fastify route injection works for API testing
- [ ] Frontend components render with router provider
- [ ] Axios mocking works for API calls
- [ ] EventSource mocking enables SSE testing
- [ ] All path traversal attack vectors are documented
- [ ] Sample fixtures cover common test scenarios
- [ ] Jest configured with appropriate coverage thresholds
- [ ] Test utilities are type-safe (TypeScript)

## Testing Requirements

Create a simple test to validate the infrastructure:

`backend/src/__tests__/utils/testHelpers.test.ts`:

```typescript
import { createMockFilesystem, createMockS3Client } from './testHelpers';
import { PATH_TRAVERSAL_ATTACKS } from './fixtures';

describe('Test Infrastructure', () => {
  it('should create mock filesystem', () => {
    const fs = createMockFilesystem({ '/test/file.txt': 'content' });
    expect(fs.existsSync('/test/file.txt')).toBe(true);
  });

  it('should create S3 mock client', () => {
    const s3Mock = createMockS3Client();
    expect(s3Mock).toBeDefined();
  });

  it('should have path traversal attack vectors', () => {
    expect(PATH_TRAVERSAL_ATTACKS.length).toBeGreaterThan(0);
  });
});
```

## Notes

- This infrastructure will be used by all subsequent phases
- Security test fixtures are critical for Phase 1.3 (path validation)
- SSE mocking is essential for Phase 1.5 and Phase 2.4 (transfer progress)
- Keep test utilities DRY and reusable across all test files

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 58-80)
- memfs docs: https://github.com/streamich/memfs
- aws-sdk-client-mock: https://github.com/m-radzikowski/aws-sdk-client-mock
- Testing Library: https://testing-library.com/react
