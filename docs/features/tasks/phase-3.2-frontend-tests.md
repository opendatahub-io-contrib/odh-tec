# Phase 3.2: Frontend Tests

> **Task ID**: phase-3.2
> **Estimated Effort**: 1.5-2 days
> **Dependencies**: All Phase 2 tasks completed

## Objective

Create comprehensive frontend tests for components, services, and integration flows. Use React Testing Library and PatternFly best practices.

## Test Suites to Create

### 1. Storage Service Tests

**File**: `frontend/src/__tests__/services/storageService.test.ts`

Test scenarios:

```typescript
describe('StorageService', () => {
  let axiosMock: MockAdapter;

  beforeEach(() => {
    axiosMock = createAxiosMock();
  });

  describe('getLocations', () => {
    it('should fetch and normalize S3 and local locations');
    it('should combine locations from both sources');
    it('should handle API errors gracefully');
  });

  describe('listFiles', () => {
    it('should list S3 files');
    it('should list local files');
    it('should support pagination');
    it('should normalize file entries');
  });

  describe('uploadFile', () => {
    it('should upload to S3');
    it('should upload to local storage');
    it('should send FormData correctly');
  });

  describe('deleteFile', () => {
    it('should delete from S3');
    it('should delete from local storage');
  });

  describe('Transfer operations', () => {
    it('should check conflicts');
    it('should initiate transfer');
    it('should cancel transfer');
  });
});
```

### 2. Buckets Component Tests

**File**: `frontend/src/__tests__/components/Buckets/Buckets.test.tsx`

Test scenarios:

```tsx
describe('Buckets Component', () => {
  it('should render storage locations');
  it('should show S3 label for S3 buckets');
  it('should show PVC label for local storage');
  it('should show unavailable label for inaccessible locations');
  it('should disable browse button for unavailable locations');
  it('should show tooltip for unavailable locations');
  it('should navigate to storage location on browse');
  it('should handle API errors');
});
```

### 3. ObjectBrowser Tests

**File**: `frontend/src/__tests__/components/ObjectBrowser/ObjectBrowser.test.tsx`

Test scenarios:

```tsx
describe('ObjectBrowser Multi-Select', () => {
  it('should render file list');
  it('should select individual file');
  it('should select all files');
  it('should support Shift+Click range selection');
  it('should support Ctrl+A to select all');
  it('should clear selection with Escape');
  it('should show bulk actions toolbar when items selected');
  it('should display selection count');
  it('should delete selected items');
  it('should clear selection on navigation');
});

describe('ObjectBrowser Storage Integration', () => {
  it('should load files from S3');
  it('should load files from local storage');
  it('should use correct API endpoints');
});
```

### 4. Transfer Component Tests

**File**: `frontend/src/__tests__/components/Transfer/DestinationPicker.test.tsx`

Test scenarios:

```tsx
describe('DestinationPicker', () => {
  it('should load storage locations');
  it('should filter unavailable locations');
  it('should navigate into directories');
  it('should navigate up');
  it('should create folder');
  it('should call onSelect with location and path');
  it('should call onCancel on cancel button');
  it('should disable select button when no location chosen');
});
```

**File**: `frontend/src/__tests__/components/Transfer/ConflictResolutionModal.test.tsx`

Test scenarios:

```tsx
describe('ConflictResolutionModal', () => {
  it('should render conflict list');
  it('should show conflict details');
  it('should allow per-file resolution selection');
  it('should support "apply to all" option');
  it('should call onResolve with resolutions');
  it('should call onCancel on cancel');
});
```

**File**: `frontend/src/__tests__/components/Transfer/TransferProgress.test.tsx`

Test scenarios:

```tsx
describe('TransferProgress', () => {
  let mockEventSource: MockEventSource;

  beforeEach(() => {
    setupEventSourceMock();
    mockEventSource = new MockEventSource('test-url');
  });

  it('should establish SSE connection');
  it('should display transfer progress');
  it('should update progress on SSE events');
  it('should show completion status');
  it('should show error status');
  it('should cancel transfer');
  it('should close SSE connection on unmount');
  it('should handle SSE errors');
});
```

### 5. HuggingFace Modal Tests

**File**: `frontend/src/__tests__/components/ObjectBrowser/HuggingFaceModal.test.tsx`

Test scenarios:

```tsx
describe('HuggingFace Import Modal', () => {
  it('should render modal');
  it('should show S3 destination fields');
  it('should show local destination fields');
  it('should switch between destination types');
  it('should validate required fields');
  it('should disable import button when form invalid');
  it('should submit with S3 destination');
  it('should submit with local destination');
  it('should open progress drawer after submit');
  it('should handle API errors');
});
```

### 6. Integration Tests

**File**: `frontend/src/__tests__/integration/transfer-flow.test.tsx`

End-to-end transfer flow:

```tsx
describe('Complete Transfer Flow', () => {
  it('should complete transfer from selection to completion', async () => {
    // 1. Render ObjectBrowser
    // 2. Select files
    // 3. Click "Copy to..."
    // 4. Choose destination in DestinationPicker
    // 5. Resolve conflicts if any
    // 6. Verify transfer initiated
    // 7. Verify progress drawer shows
    // 8. Simulate SSE progress events
    // 9. Verify completion
  });

  it('should handle transfer cancellation');
  it('should handle transfer errors');
});
```

## Test Utilities Usage

Use Phase 0 test infrastructure:

- `renderWithRouter()` for component rendering
- `createAxiosMock()` for API mocking
- `MockEventSource` for SSE testing
- `createMockFile()` for file uploads
- `MOCK_STORAGE_LOCATIONS` for test data

## Running Tests

```bash
# Run all frontend tests
cd frontend
npm test

# Run specific test suite
npm test -- Buckets.test.tsx

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Coverage Requirements

- **Storage Service**: >80%
- **Components**: >80%
- **Overall new code**: >80%

## Acceptance Criteria

- [ ] All component tests pass
- [ ] All service tests pass
- [ ] Integration tests pass
- [ ] SSE mocking works correctly
- [ ] User interactions tested (clicks, keyboard)
- [ ] API calls verified with axios mock
- [ ] Error handling tested
- [ ] Code coverage >80% for new code
- [ ] No console errors in tests
- [ ] Tests are deterministic

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 1068-1083)
- Testing Library: https://testing-library.com/react
- PatternFly Testing: https://www.patternfly.org/get-started/develop#testing
