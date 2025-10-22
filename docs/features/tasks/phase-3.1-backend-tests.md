# Phase 3.1: Backend Tests

> **Task ID**: phase-3.1
> **Estimated Effort**: 2-2.5 days
> **Dependencies**: All Phase 1 tasks completed

## Objective

Create comprehensive backend tests covering security, API routes, transfer operations, and integration scenarios. Achieve >80% code coverage for new code.

## Test Suites to Create

### 1. Security Tests (CRITICAL)

**File**: `backend/src/__tests__/utils/localStorage.test.ts` (already created in Phase 1.3)

Verify all path traversal attacks are blocked:

- Path normalization attacks
- URL-encoded traversal attempts
- Null byte injection
- Unicode normalization attacks
- Symlink escape attempts
- Absolute path rejection

**Coverage target**: 100% for security tests (zero tolerance for vulnerabilities)

### 2. Local Storage Route Tests

**File**: `backend/src/__tests__/routes/api/local/index.test.ts`

Test scenarios:

```typescript
describe('GET /api/local/locations', () => {
  it('should return all configured locations');
  it('should mark unavailable locations');
  it('should handle no configured locations');
});

describe('GET /api/local/files/:locationId/:path*', () => {
  it('should list files and directories');
  it('should include file metadata');
  it('should support pagination');
  it('should reject invalid location ID');
  it('should reject path traversal attempts');
  it('should return 404 for non-existent paths');
  it('should return 403 for permission errors');
});

describe('POST /api/local/files/:locationId/:path*', () => {
  it('should upload file via multipart');
  it('should return 409 for existing file');
  it('should return 413 for file too large');
  it('should reject invalid paths');
  it('should handle upload errors gracefully');
});

describe('GET /api/local/download/:locationId/:path*', () => {
  it('should stream file download');
  it('should set correct headers');
  it('should reject files over size limit');
  it('should return 404 for non-existent file');
});

describe('DELETE /api/local/files/:locationId/:path*', () => {
  it('should delete file');
  it('should delete directory recursively');
  it('should return item count');
  it('should return 404 for non-existent path');
});

describe('POST /api/local/directories/:locationId/:path*', () => {
  it('should create directory');
  it('should create nested directories (mkdir -p)');
  it('should reject invalid paths');
});
```

### 3. Transfer Route Tests

**File**: `backend/src/__tests__/routes/api/transfer/index.test.ts`

Test scenarios:

```typescript
describe('POST /api/transfer', () => {
  it('should create transfer job for S3→Local');
  it('should create transfer job for Local→S3');
  it('should create transfer job for Local→Local');
  it('should create transfer job for S3→S3');
  it('should validate source and destination');
  it('should return job ID and SSE URL');
  it('should respect concurrency limits');
});

describe('GET /api/transfer/progress/:jobId', () => {
  it('should establish SSE connection');
  it('should stream progress events');
  it('should close connection when complete');
  it('should return 404 for invalid job ID');
  it('should handle connection errors');
});

describe('DELETE /api/transfer/:jobId', () => {
  it('should cancel active transfer');
  it('should clean up partial files');
  it('should return success status');
});

describe('POST /api/transfer/check-conflicts', () => {
  it('should detect S3 conflicts');
  it('should detect local conflicts');
  it('should return empty array when no conflicts');
  it('should handle multiple files');
});
```

### 4. HuggingFace Integration Tests

**File**: `backend/src/__tests__/routes/api/objects/huggingface.test.ts`

Test scenarios:

```typescript
describe('POST /api/objects/huggingface-import', () => {
  it('should validate S3 destination parameters');
  it('should validate local destination parameters');
  it('should reject invalid local paths');
  it('should queue download job');
  it('should return SSE URL');
  it('should download to S3');
  it('should download to local storage');
  it('should handle HuggingFace API errors');
  it('should enforce file size limits');
});
```

### 5. Error Handling Tests

Test all error scenarios:

- ENOSPC (disk full)
- EACCES (permission denied)
- EMFILE (too many open files)
- ENOENT (file not found)
- Network errors
- S3 errors
- Invalid parameters
- Malformed requests

### 6. Integration Tests

**File**: `backend/src/__tests__/integration/transfer.test.ts`

End-to-end transfer scenarios:

```typescript
describe('End-to-end transfer flows', () => {
  it('should transfer file from S3 to local storage');
  it('should transfer file from local to S3');
  it('should transfer multiple files with progress');
  it('should handle conflict resolution (overwrite)');
  it('should handle conflict resolution (skip)');
  it('should handle conflict resolution (rename)');
  it('should cancel in-progress transfer');
  it('should recover from partial failures');
  it('should respect concurrency limits');
  it('should enforce file size limits');
});
```

## Test Utilities Usage

Use Phase 0 test infrastructure:

- `createMockFilesystem()` for filesystem mocking
- `createMockS3Client()` for S3 mocking
- `injectRoute()` for Fastify route testing
- `PATH_TRAVERSAL_ATTACKS` for security tests
- `MOCK_STORAGE_LOCATIONS` for test fixtures

## Running Tests

```bash
# Run all backend tests
cd backend
npm test

# Run specific test suite
npm test -- localStorage.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch
```

## Coverage Requirements

- **Security module (localStorage.ts)**: >90%
- **API routes**: >80%
- **Transfer queue**: >80%
- **Overall new code**: >80%

## Acceptance Criteria

- [ ] All security tests pass (100% pass rate)
- [ ] All API route tests pass
- [ ] All transfer operation tests pass
- [ ] Integration tests pass
- [ ] Error handling tests cover all error types
- [ ] Code coverage >80% for new code
- [ ] No false positives (valid operations not blocked)
- [ ] No false negatives (attacks not detected)
- [ ] Tests run in CI/CD pipeline
- [ ] Tests are deterministic (no flaky tests)

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 1012-1066)
- Jest documentation: https://jestjs.io/
