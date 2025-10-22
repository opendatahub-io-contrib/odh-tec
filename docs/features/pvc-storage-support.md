# PVC Storage Support Feature - REVISED PLAN

> **Status**: Approved for implementation
> **Last Updated**: 2025-10-23
> **Estimated Effort**: 18-24 days (~4 weeks)

## Overview

Extend the S3 browser to also work with local PVC-mounted directories, with unified interface and cross-storage transfer capabilities.

## Design Decisions

Following comprehensive review and planning, these key decisions were made:

### Architecture Decisions

- **Location IDs**: String-based (`"local-0"`, `"local-1"`, `"s3-bucket-name"`) for type consistency
- **Transfer Progress**: Server-Sent Events (SSE) pattern matching HuggingFace implementation
- **Missing Directories**: Skip with warning log (don't fail startup)
- **File Conflicts**: Prompt user with modal (overwrite/skip/rename options)
- **Symlinks**: Allow within bounds (validate resolved path stays within allowed directories)

### Configuration Decisions

- **Max File Size**: 20GB default via `MAX_FILE_SIZE_GB` environment variable
- **Disk Quota Display**: Skip (incompatible with container overlay filesystem)
- **Audit Logging**: Not implemented (keep it simple)
- **Rate Limiting**: Not implemented (rely on `MAX_CONCURRENT_TRANSFERS`)

## Requirements

### Key Features

1. **Unified UI** - Show both S3 buckets and local storage paths with type indicators
2. **Full CRUD Operations** - Create/delete directories, upload/download/delete files on local storage
3. **Cross-Storage Transfers** - S3↔PVC transfers via context menu + destination picker modal
4. **Multi-Select Support** - Select multiple files and folders for batch operations
5. **HuggingFace Integration** - Download models to both S3 and local PVC
6. **File Metadata** - Display size and modified date for local files
7. **Shared Concurrency** - Use same transfer limit pool for all operations
8. **Configuration** - `LOCAL_STORAGE_PATHS` env var (default: `/opt/app-root/src/data`)
9. **Security** - Strict path validation to prevent directory traversal
10. **Conflict Resolution** - User prompts before overwriting existing files
11. **Real-time Progress** - SSE streaming for all transfer operations
12. **File Size Limits** - Configurable max file size (default 20GB)

### User Experience

- Local storage paths appear as top-level items alongside S3 buckets
- Visual indicators (PatternFly 6 Label badges) distinguish S3 from PVC storage
- "Copy to..." action in file/folder context menus
- Destination picker modal shows all available storage locations
- Conflict resolution modal for existing files (overwrite/skip/rename)
- Real-time transfer progress drawer with SSE updates
- Support for recursive folder operations
- Multi-select with keyboard shortcuts (Ctrl+A, Shift+Click)

## Implementation Plan

### Phase 0: Test Infrastructure Setup

#### Backend Test Utilities

**File**: `backend/src/__tests__/utils/testHelpers.ts`

Create testing infrastructure:

- Filesystem mocking utilities using `memfs`
- S3 client mock factory using `aws-sdk-client-mock`
- Fastify test injection helpers
- Path validation attack vector fixtures
- Transfer queue testing utilities

#### Frontend Test Utilities

**File**: `frontend/src/__tests__/utils/testHelpers.ts`

Create testing infrastructure:

- PatternFly 6 component render helpers
- axios-mock-adapter configuration patterns
- Storage service mock factory
- SSE EventSource mocking utilities

### Phase 1: Backend - Local Storage Foundation

#### 1.1 Shared Transfer Queue Module

**File**: `backend/src/utils/transferQueue.ts`

Centralized transfer coordination for all transfer types (S3, HuggingFace, cross-storage).

**Key Types**:

```typescript
interface TransferJob {
  id: string;
  type: 's3-upload' | 's3-download' | 'local-upload' | 'cross-storage' | 'huggingface';
  status: 'queued' | 'active' | 'completed' | 'failed';
  files: TransferFileJob[];
  progress: TransferProgress;
}

interface TransferFileJob {
  sourcePath: string;
  destinationPath: string;
  size: number;
  loaded: number;
  status: 'queued' | 'transferring' | 'completed' | 'error';
  error?: string;
}
```

**Key Functions**:

```typescript
class TransferQueue {
  private limiter: ReturnType<typeof pLimit>;
  private jobs: Map<string, TransferJob>;

  queueJob(job: TransferJob): string; // Returns job ID
  getJob(jobId: string): TransferJob | undefined;
  cancelJob(jobId: string): void;
  getActiveJobIds(): string[];
}

export const transferQueue = new TransferQueue(getMaxConcurrentTransfers());
```

#### 1.2 Configuration Updates

**File**: `backend/src/utils/config.ts`

**Add configuration management**:

```typescript
// Parse LOCAL_STORAGE_PATHS from environment
let localStoragePaths = process.env.LOCAL_STORAGE_PATHS?.split(',').map(p => p.trim()) || ['/opt/app-root/src/data'];

// Parse MAX_FILE_SIZE_GB from environment
let maxFileSizeGB = parseInt(process.env.MAX_FILE_SIZE_GB || '20', 10);

export const getLocalStoragePaths = (): string[];
export const getMaxFileSizeGB = (): number;
export const updateMaxFileSizeGB = (newLimit: number): void;
```

#### 1.3 Local Storage Utilities

**File**: `backend/src/utils/localStorage.ts`

**Security-First Path Validation with Symlink Support**:

```typescript
async function validatePath(locationId: string, relativePath: string): Promise<string> {
  // 1. Parse location index from ID ("local-0" → 0)
  // 2. Get base path from getLocalStoragePaths()[index]
  // 3. Throw if index out of bounds or base path doesn't exist
  // 4. Join base path with relative path and normalize
  // 5. Resolve symlinks using fs.realpath()
  // 6. Verify resolved path starts with base path (security check)
  // 7. Return validated absolute path
  // Throws: SecurityError (path escapes bounds), NotFoundError (location invalid)
}
```

**Key Functions**:

- `getStorageLocations()`: Returns array of available locations (skips missing dirs with `req.log.warn`)
- `validatePath(locationId, relativePath)`: Security-hardened validation with symlink resolution
- `listDirectory(absolutePath, limit?, offset?)`: Paginated file listing with metadata
- `createDirectory(absolutePath)`: mkdir -p behavior with validation
- `deleteFileOrDirectory(absolutePath)`: Recursive delete with safety checks
- `getFileMetadata(absolutePath)`: Returns size, mtime, type, symlink target
- `streamFile(absolutePath)`: Returns Node.js Readable stream
- `checkFileSize(absolutePath)`: Validates against MAX_FILE_SIZE_GB

**Types**:

```typescript
interface FileEntry {
  name: string;
  path: string; // relative to location root
  type: 'file' | 'directory' | 'symlink';
  size?: number; // bytes
  modified?: string; // ISO 8601 timestamp
  target?: string; // symlink target (relative path)
}

interface StorageLocation {
  id: string; // "local-0", "local-1", etc.
  name: string; // display name (e.g., "Data Storage")
  path: string; // filesystem path
  type: 'local';
  available: boolean; // false if directory missing/inaccessible
}
```

**Error Handling**:

- `SecurityError`: Path validation failures (traversal attempts, symlink escapes)
- `PermissionError`: EACCES, EPERM filesystem errors
- `StorageError`: ENOSPC (disk full), EIO (I/O errors), EMFILE (too many open files)
- All errors mapped to appropriate HTTP status codes in routes

#### 1.4 Local Storage API Routes

**Directory**: `backend/src/routes/api/local/` (new Fastify plugin)

**Note**: All routes use corrected Fastify wildcard syntax (`:path*` instead of `/*`)

**Routes**:

**`GET /api/local/locations`**

- Lists all configured local storage locations
- Returns available and unavailable locations
- Response:
  ```typescript
  {
    locations: Array<{
      id: string; // "local-0", "local-1"
      name: string; // display name or path basename
      path: string; // actual filesystem path
      type: 'local';
      available: boolean; // false if directory missing/inaccessible
    }>;
  }
  ```

**`GET /api/local/files/:locationId/:path*`**

- Lists files and directories at the specified path
- Query params: `?limit=100&offset=0` for pagination (optional)
- Validates path before listing
- Response:
  ```typescript
  {
    files: FileEntry[];
    currentPath: string;
    parentPath: string | null;
    totalCount?: number;  // if paginated
  }
  ```

**`POST /api/local/files/:locationId/:path*`**

- Uploads file using multipart streaming
- Checks file size against MAX_FILE_SIZE_GB before accepting
- Returns 409 Conflict if file exists (for conflict detection)
- Returns 413 Payload Too Large if file exceeds limit
- Response:
  ```typescript
  {
    uploaded: boolean;
    path: string;
  }
  ```

**`GET /api/local/download/:locationId/:path*`**

- Downloads file using streaming
- Sets Content-Type and Content-Disposition headers
- Supports HTTP Range requests for resume capability
- Validates path and file size before streaming

**`DELETE /api/local/files/:locationId/:path*`**

- Deletes file or directory (recursive for directories)
- Validates path before deletion
- Response:
  ```typescript
  {
    deleted: boolean;
    itemCount: number; // number of items deleted
  }
  ```

**`POST /api/local/directories/:locationId/:path*`**

- Creates directory (mkdir -p behavior)
- Validates path before creation
- Response:
  ```typescript
  {
    created: boolean;
    path: string;
  }
  ```

#### 1.5 Cross-Storage Transfer Routes

**Directory**: `backend/src/routes/api/transfer/` (new Fastify plugin)

**`POST /api/transfer`**

- Initiates cross-storage transfer operation
- Uses shared `transferQueue` for concurrency control
- Request:
  ```typescript
  {
    source: {
      type: 'local' | 's3';
      locationId: string;
      path: string;
    };
    destination: {
      type: 'local' | 's3';
      locationId: string;
      path: string;
    };
    files: string[];  // relative paths to transfer
    conflictResolution: 'overwrite' | 'skip' | 'rename';
  }
  ```
- Response:
  ```typescript
  {
    jobId: string;
    sseUrl: string; // e.g., "/api/transfer/progress/:jobId"
  }
  ```

**`GET /api/transfer/progress/:jobId`**

- Server-Sent Events (SSE) endpoint for real-time progress
- Streams transfer progress events
- Event format:
  ```typescript
  {
    file: string;
    loaded: number;
    total: number;
    status: 'queued' | 'transferring' | 'completed' | 'error';
    error?: string;
  }
  ```
- Stream ends when all files completed or transfer cancelled

**`DELETE /api/transfer/:jobId`**

- Cancels active transfer
- Cleans up partial files
- Response:
  ```typescript
  {
    cancelled: boolean;
  }
  ```

**`POST /api/transfer/check-conflicts`**

- Pre-flight check for conflicting files before transfer
- Request:
  ```typescript
  {
    destination: {
      type: 'local' | 's3';
      locationId: string;
      path: string;
    };
    files: string[];  // files to check
  }
  ```
- Response:
  ```typescript
  {
    conflicts: string[];  // list of conflicting file paths
  }
  ```

**Transfer Implementation Details**:

Transfer type handlers:

- **S3→Local**: `s3Client.send(GetObjectCommand).Body.pipe(fs.createWriteStream())`
- **Local→S3**: `fs.createReadStream().pipe(new Upload())`
- **Local→Local**: `fs.createReadStream().pipe(fs.createWriteStream())`
- **S3→S3**: `CopyObjectCommand` (no streaming needed)

Key behaviors:

- Use 64KB chunks for streaming
- Handle rename conflicts: append `-1`, `-2`, etc. to filename
- Cleanup partial files on error or cancellation
- Respect MAX_CONCURRENT_TRANSFERS via shared `transferQueue`
- Validate file sizes before starting transfer
- Update SSE progress stream in real-time

#### 1.6 HuggingFace Integration

**File**: `backend/src/routes/api/objects/index.ts`

**Modify existing `/huggingface-import` route** (around line 372)

**Add request parameters**:

```typescript
{
  // New parameters
  destinationType: 's3' | 'local';
  localLocationId?: string;  // required if destinationType === 'local'
  localPath?: string;        // destination directory path

  // Existing parameters
  bucketName?: string;       // required if destinationType === 's3'
  modelId: string;
  hfToken?: string;
  prefix?: string;
}
```

**Implementation changes**:

- Route downloads based on `destinationType`
- For local destinations:
  - Validate `localLocationId` and `localPath`
  - Use `validatePath()` for security
  - Stream downloads to local filesystem
- Use shared `transferQueue` for concurrency
- Maintain existing SSE progress pattern
- Validate file sizes against MAX_FILE_SIZE_GB
- Update frontend API call to include new parameters

### Phase 2: Frontend - UI Integration

#### 2.1 Storage Service & Types

**File**: `frontend/src/app/services/storageService.ts` (new)

Unified service for all storage operations (S3 and local).

**Types**:

```typescript
export type StorageType = 's3' | 'local';

export interface StorageLocation {
  id: string; // "local-0", "local-1", or S3 bucket name
  name: string; // Display name
  type: StorageType;
  available: boolean; // false if directory missing/inaccessible
  // S3-specific
  region?: string;
  // Local-specific
  path?: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: Date;
  target?: string; // symlink target
}

export interface TransferConflict {
  path: string;
  existingSize?: number;
  existingModified?: Date;
}
```

**API Client Methods**:

```typescript
export const storageService = {
  // Storage locations
  async getLocations(): Promise<StorageLocation[]> {
    // Fetch S3 buckets from /api/buckets
    // Fetch local locations from /api/local/locations
    // Combine and normalize to unified format
  },

  // File operations
  async listFiles(locationId: string, path: string, limit?, offset?): Promise<{files: FileEntry[], totalCount: number}>,
  async uploadFile(locationId: string, path: string, file: File): Promise<void>,
  async downloadFile(locationId: string, path: string): Promise<void>,
  async deleteFile(locationId: string, path: string): Promise<void>,

  // Directory operations
  async createDirectory(locationId: string, path: string): Promise<void>,

  // Transfer operations
  async checkConflicts(destination: {type, locationId, path}, files: string[]): Promise<string[]>,
  async initiateTransfer(source, destination, files, conflictResolution): Promise<{jobId: string, sseUrl: string}>,
  async cancelTransfer(jobId: string): Promise<void>,
};
```

#### 2.2 Update Buckets Component

**File**: `frontend/src/app/components/Buckets/Buckets.tsx`

**Changes**:

- Replace S3-specific API call with `storageService.getLocations()`
- Display unified storage list
- Add PatternFly 6 Label badges to distinguish types:
  ```tsx
  {
    location.type === 's3' ? (
      <Label color="blue" icon={<CloudIcon />}>
        S3
      </Label>
    ) : (
      <Label color="green" icon={<FolderIcon />}>
        PVC
      </Label>
    );
  }
  ```
- Show unavailable locations in disabled state
- Add Tooltip to explain why location is unavailable
- Update navigation to handle both storage types
- Update creation/deletion logic to support both types

#### 2.3 Extend ObjectBrowser Component

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Add Multi-Select Support**:

Use PatternFly 6 Table selectable rows pattern:

```tsx
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

<Table>
  <Thead>
    <Tr>
      <Th
        select={{
          onSelect: handleSelectAll,
          isSelected: allSelected,
        }}
      />
      <Th>Name</Th>
      <Th>Size</Th>
      <Th>Modified</Th>
      <Th>Actions</Th>
    </Tr>
  </Thead>
  <Tbody>
    {files.map((file) => (
      <Tr key={file.path} isRowSelected={selectedItems.has(file.path)}>
        <Td
          select={{
            rowIndex: index,
            onSelect: (event, isSelected) => handleSelectRow(file.path, isSelected),
            isSelected: selectedItems.has(file.path),
          }}
        />
        <Td>{file.name}</Td>
        <Td>{formatSize(file.size)}</Td>
        <Td>{formatDate(file.modified)}</Td>
        <Td>{/* actions */}</Td>
      </Tr>
    ))}
  </Tbody>
</Table>;
```

**Add Bulk Actions Toolbar**:

```tsx
{
  selectedItems.size > 0 && (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem>
          <Text>
            {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
          </Text>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="primary" onClick={handleCopyTo}>
            <CopyIcon /> Copy to...
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="danger" onClick={handleDeleteSelected}>
            <TrashIcon /> Delete
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="link" onClick={() => setSelectedItems(new Set())}>
            Clear selection
          </Button>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
}
```

**Keyboard Shortcuts**:

- Ctrl+A: Select all visible items
- Shift+Click: Range selection between last clicked and current

**API Integration**:

- Detect storage type from route/context
- Use `storageService` for all API calls
- Conditional rendering based on storage type where needed
- Clear selection on navigation

#### 2.4 Transfer Components

**Directory**: `frontend/src/app/components/Transfer/` (new)

**DestinationPicker.tsx**:

PatternFly 6 Modal with navigation to select transfer destination.

```tsx
<Modal title="Select Destination" isOpen={isOpen} onClose={onCancel} variant="large">
  <Form>
    <FormGroup label="Storage Location">
      <FormSelect
        value={selectedLocation}
        onChange={(value) => {
          setSelectedLocation(value);
          setCurrentPath('');
        }}
      >
        {locations.map((loc) => (
          <FormSelectOption
            key={loc.id}
            value={loc.id}
            label={`${loc.name} ${!loc.available ? '(unavailable)' : ''}`}
            isDisabled={!loc.available}
          />
        ))}
      </FormSelect>
    </FormGroup>

    {/* Breadcrumb navigation for current path */}
    <Breadcrumb>
      <BreadcrumbItem to="#" onClick={() => setCurrentPath('')}>
        Root
      </BreadcrumbItem>
      {currentPathSegments.map((segment, i) => (
        <BreadcrumbItem key={i} to="#" onClick={() => navigateToPath(segment.path)}>
          {segment.name}
        </BreadcrumbItem>
      ))}
    </Breadcrumb>

    {/* Directory listing (directories only) */}
    <DataList aria-label="Directory list">
      {directories.map((dir) => (
        <DataListItem key={dir.path}>
          <DataListItemRow onClick={() => navigateInto(dir)}>
            <DataListItemCells>
              <DataListCell>
                <FolderIcon /> {dir.name}
              </DataListCell>
            </DataListItemCells>
          </DataListItemRow>
        </DataListItem>
      ))}
    </DataList>

    <Button variant="secondary" onClick={handleCreateFolder} icon={<PlusIcon />}>
      Create Folder
    </Button>
  </Form>

  <ActionGroup>
    <Button
      variant="primary"
      onClick={() => onSelect(selectedLocation, currentPath)}
      isDisabled={!selectedLocation}
    >
      Select Destination
    </Button>
    <Button variant="link" onClick={onCancel}>
      Cancel
    </Button>
  </ActionGroup>
</Modal>
```

**ConflictResolutionModal.tsx** (new):

Modal to handle file conflicts before transfer.

```tsx
<Modal title="File Conflicts Detected" isOpen={isOpen} onClose={onCancel} variant="medium">
  <Alert
    variant="warning"
    title={`${conflicts.length} file${conflicts.length > 1 ? 's' : ''} already exist in destination`}
  >
    Choose how to handle each conflict
  </Alert>

  <DataList aria-label="Conflict list">
    {conflicts.map((conflict) => (
      <DataListItem key={conflict.path}>
        <DataListItemRow>
          <DataListItemCells>
            <DataListCell>
              <strong>{conflict.path}</strong>
              {conflict.existingSize && (
                <Text component="small">
                  Existing: {formatSize(conflict.existingSize)}, modified{' '}
                  {formatDate(conflict.existingModified)}
                </Text>
              )}
            </DataListCell>
            <DataListCell>
              <Radio
                id={`${conflict.path}-overwrite`}
                name={conflict.path}
                value="overwrite"
                label="Overwrite"
                isChecked={resolutions[conflict.path] === 'overwrite'}
                onChange={() => setResolution(conflict.path, 'overwrite')}
              />
              <Radio
                id={`${conflict.path}-skip`}
                name={conflict.path}
                value="skip"
                label="Skip"
                isChecked={resolutions[conflict.path] === 'skip'}
                onChange={() => setResolution(conflict.path, 'skip')}
              />
              <Radio
                id={`${conflict.path}-rename`}
                name={conflict.path}
                value="rename"
                label="Keep both (rename)"
                isChecked={resolutions[conflict.path] === 'rename'}
                onChange={() => setResolution(conflict.path, 'rename')}
              />
            </DataListCell>
          </DataListItemCells>
        </DataListItemRow>
      </DataListItem>
    ))}
  </DataList>

  <Checkbox
    id="apply-to-all"
    label="Apply this choice to all conflicts"
    onChange={handleApplyToAll}
  />

  <ActionGroup>
    <Button variant="primary" onClick={() => onProceed(resolutions)}>
      Proceed with Transfer
    </Button>
    <Button variant="link" onClick={onCancel}>
      Cancel
    </Button>
  </ActionGroup>
</Modal>
```

**TransferProgress.tsx**:

Drawer component showing real-time transfer progress via SSE.

```tsx
<Drawer isExpanded={isOpen}>
  <DrawerContent>
    <DrawerHead>
      <Title headingLevel="h2">File Transfers</Title>
      <DrawerActions>
        <DrawerCloseButton onClick={onClose} />
      </DrawerActions>
    </DrawerHead>
    <DrawerContentBody>
      {transfers.map((transfer) => (
        <Card key={transfer.file} isCompact>
          <CardTitle>
            <Flex>
              <FlexItem grow={{ default: 'grow' }}>{transfer.file}</FlexItem>
              <FlexItem>
                {transfer.status === 'error' ? (
                  <Label color="red" icon={<ExclamationCircleIcon />}>
                    Error
                  </Label>
                ) : transfer.status === 'completed' ? (
                  <Label color="green" icon={<CheckCircleIcon />}>
                    Complete
                  </Label>
                ) : (
                  <Label color="blue">Transferring</Label>
                )}
              </FlexItem>
            </Flex>
          </CardTitle>
          <CardBody>
            {transfer.status === 'transferring' && (
              <Progress
                value={transfer.loaded}
                max={transfer.total}
                size={ProgressSize.sm}
                label={`${formatSize(transfer.loaded)} / ${formatSize(transfer.total)}`}
              />
            )}
            {transfer.status === 'error' && (
              <Alert variant="danger" isInline title="Transfer failed">
                {transfer.error}
              </Alert>
            )}
          </CardBody>
        </Card>
      ))}

      {jobId && (
        <Button
          variant="danger"
          onClick={() => handleCancelTransfer(jobId)}
          isDisabled={allCompleted}
        >
          Cancel Transfer
        </Button>
      )}
    </DrawerContentBody>
  </DrawerContent>
</Drawer>;

// SSE connection in useEffect
useEffect(() => {
  if (!jobId || !sseUrl) return;

  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateTransferProgress(data);

    // Check if all completed
    if (data.status === 'completed' || data.status === 'error') {
      checkIfAllCompleted();
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Transfer connection lost',
      description: 'Unable to get real-time progress updates',
    });
    eventSource.close();
  };

  return () => eventSource.close();
}, [jobId, sseUrl]);
```

**TransferAction.tsx**:

Integration of transfer flow into context menus.

```tsx
// Add to file/folder kebab menu actions
<DropdownItem onClick={handleCopyTo}>
  <CopyIcon /> Copy to...
</DropdownItem>;

const handleCopyTo = async () => {
  try {
    // 1. Open DestinationPicker modal
    const { locationId, path } = await openDestinationPicker();

    const destination = {
      type: getStorageType(locationId),
      locationId,
      path,
    };

    // 2. Check for conflicts
    const conflicts = await storageService.checkConflicts(destination, Array.from(selectedFiles));

    // 3. If conflicts exist, get user resolution
    let conflictResolution = 'overwrite';
    if (conflicts.length > 0) {
      const resolutions = await openConflictResolutionModal(conflicts);
      // Use majority resolution or 'rename' as safe default
      conflictResolution = getMajorityResolution(resolutions) || 'rename';
    }

    // 4. Initiate transfer
    const { jobId, sseUrl } = await storageService.initiateTransfer({
      source: getCurrentSource(),
      destination,
      files: Array.from(selectedFiles),
      conflictResolution,
    });

    // 5. Open TransferProgress drawer to show SSE stream
    openTransferProgressDrawer(jobId, sseUrl);

    // 6. Clear selection
    setSelectedItems(new Set());
  } catch (error) {
    console.error('Transfer initiation failed:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Transfer failed',
      description: error.message || 'Unable to initiate transfer',
    });
  }
};
```

#### 2.5 Update HuggingFace Import UI

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

Modify HuggingFace import modal section to support local storage destinations.

**Add destination type selector and conditional fields**:

```tsx
<Modal title="Import from HuggingFace" isOpen={showHFModal}>
  <Form>
    <FormGroup label="Model ID" isRequired>
      <TextInput
        value={modelId}
        onChange={setModelId}
        placeholder="e.g., meta-llama/Llama-2-7b-hf"
      />
    </FormGroup>

    <FormGroup label="HuggingFace Token">
      <TextInput type="password" value={hfToken} onChange={setHfToken} />
    </FormGroup>

    {/* New: Destination type selector */}
    <FormGroup label="Destination Type" isRequired>
      <Radio
        id="dest-s3"
        name="destType"
        value="s3"
        label="S3 Bucket"
        isChecked={destType === 's3'}
        onChange={() => setDestType('s3')}
      />
      <Radio
        id="dest-local"
        name="destType"
        value="local"
        label="Local Storage (PVC)"
        isChecked={destType === 'local'}
        onChange={() => setDestType('local')}
      />
    </FormGroup>

    {/* Conditional destination fields */}
    {destType === 's3' ? (
      <>
        <FormGroup label="Bucket" isRequired>
          <FormSelect value={bucketName} onChange={setBucketName}>
            {buckets.map((bucket) => (
              <FormSelectOption key={bucket.Name} value={bucket.Name} label={bucket.Name} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Prefix (optional)">
          <TextInput value={prefix} onChange={setPrefix} />
        </FormGroup>
      </>
    ) : (
      <>
        <FormGroup label="Storage Location" isRequired>
          <FormSelect value={localLocationId} onChange={setLocalLocationId}>
            {localLocations.map((loc) => (
              <FormSelectOption
                key={loc.id}
                value={loc.id}
                label={loc.name}
                isDisabled={!loc.available}
              />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Destination Path" isRequired>
          <TextInput
            value={localPath}
            onChange={setLocalPath}
            placeholder="e.g., models/llama-2-7b"
          />
        </FormGroup>
      </>
    )}
  </Form>

  <ActionGroup>
    <Button variant="primary" onClick={handleImport} isDisabled={!isFormValid()}>
      Import Model
    </Button>
    <Button variant="link" onClick={() => setShowHFModal(false)}>
      Cancel
    </Button>
  </ActionGroup>
</Modal>;

// Update API call
const handleImport = async () => {
  const params = {
    modelId,
    hfToken: hfToken || undefined,
    destinationType: destType,
    ...(destType === 's3'
      ? {
          bucketName,
          prefix,
        }
      : {
          localLocationId,
          localPath,
        }),
  };

  // Connect to SSE endpoint and show progress
  // ... existing SSE logic
};
```

### Phase 3: Testing & Documentation

#### 3.1 Backend Tests

**Security Tests** (`backend/src/__tests__/utils/localStorage.test.ts`):

Critical path validation tests:

- ✅ Reject `../../../etc/passwd`
- ✅ Reject `..%2F..%2F` (URL encoded)
- ✅ Reject paths with null bytes
- ✅ Reject symlinks escaping bounds
- ✅ Accept valid relative paths
- ✅ Accept symlinks within bounds
- ✅ Reject Unicode normalization attacks
- ✅ Reject absolute paths outside allowed directories

**API Route Tests**:

- Local storage routes (`backend/src/__tests__/routes/api/local/*.test.ts`)

  - List locations (available and unavailable)
  - File CRUD operations
  - Directory CRUD operations
  - Pagination
  - File size validation
  - Error handling (ENOSPC, EACCES, EMFILE, ENOENT)

- Transfer routes (`backend/src/__tests__/routes/api/transfer/*.test.ts`)
  - All transfer combinations (S3→Local, Local→S3, Local→Local, S3→S3)
  - Conflict resolution (overwrite, skip, rename)
  - SSE progress streaming
  - Transfer cancellation
  - Concurrency limits
  - Partial failure recovery
  - File size validation

**Integration Tests**:

- End-to-end transfer flows with real filesystem (temp dirs) and mocked S3
- HuggingFace import to local storage
- Multi-file transfers with mixed success/failure

#### 3.2 Frontend Tests

**Component Tests** (`frontend/src/__tests__/components/**/*.test.tsx`):

- StorageService API integration
- Multi-select state management (select all, range select, keyboard shortcuts)
- DestinationPicker navigation and folder creation
- ConflictResolutionModal user flow
- TransferProgress SSE connection and updates
- HuggingFace modal with destination type switching
- Error handling and notification display

**Integration Tests**:

- Complete transfer flow from selection to completion
- Conflict detection and resolution
- SSE connection handling and reconnection

#### 3.3 Documentation Updates

**Update existing documentation**:

1. `backend/.env.example`

   ```bash
   # Local storage paths (comma-separated)
   # Default: /opt/app-root/src/data
   LOCAL_STORAGE_PATHS=/mnt/data,/mnt/models

   # Maximum file size for transfers in GB
   # Default: 20
   MAX_FILE_SIZE_GB=20
   ```

2. Root `CLAUDE.md`

   - Add PVC storage support to feature list
   - Update architecture overview with local storage
   - Add transfer queue to key components

3. `docs/architecture/backend-architecture.md`

   - Document transfer queue module
   - Document local storage utilities
   - Add API route documentation for local storage and transfers
   - Update data flow diagrams

4. `docs/architecture/frontend-architecture.md`

   - Document storage service
   - Document new transfer components
   - Update component hierarchy

5. `docs/deployment/configuration.md`
   - Document LOCAL_STORAGE_PATHS configuration
   - Document MAX_FILE_SIZE_GB configuration
   - Add PVC mounting examples

**Create new documentation**:

`docs/features/pvc-storage-guide.md`:

- **Kubernetes Setup**:

  - Notebook/StatefulSet example manifests (not bare Pods)
  - PVC access modes (ReadWriteOnce vs ReadWriteMany)
  - Volume mount configuration
  - Storage class recommendations

- **Security**:

  - Path validation behavior
  - Symlink handling
  - File permissions and ownership
  - Container security contexts

- **Performance**:

  - Concurrency tuning (MAX_CONCURRENT_TRANSFERS)
  - File size limits (MAX_FILE_SIZE_GB)
  - Buffer size considerations
  - Network vs local disk performance

- **Troubleshooting**:
  - Permission denied errors
  - Disk full scenarios
  - PVC mount failures
  - Path validation errors
  - Common configuration mistakes

## Configuration

### Environment Variables

```bash
# Comma-separated list of allowed local storage paths
# Default: /opt/app-root/src/data
LOCAL_STORAGE_PATHS=/mnt/data,/mnt/models,/opt/app-root/src/data

# Maximum file size for transfers in GB
# Default: 20
MAX_FILE_SIZE_GB=20

# Existing variables (unchanged)
MAX_CONCURRENT_TRANSFERS=2
AWS_S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1
AWS_S3_BUCKET=...
HF_TOKEN=...
```

### Example Kubernetes Deployment with PVCs

**StatefulSet with PVC** (recommended for ODH/RHOAI):

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: odh-tec
spec:
  serviceName: odh-tec
  replicas: 1
  selector:
    matchLabels:
      app: odh-tec
  template:
    metadata:
      labels:
        app: odh-tec
    spec:
      containers:
        - name: odh-tec
          image: quay.io/rh-aiservices-bu/odh-tec:latest
          ports:
            - containerPort: 8888
          env:
            - name: LOCAL_STORAGE_PATHS
              value: '/mnt/data,/mnt/models'
            - name: MAX_FILE_SIZE_GB
              value: '20'
            - name: MAX_CONCURRENT_TRANSFERS
              value: '2'
          volumeMounts:
            - name: data-storage
              mountPath: /mnt/data
            - name: model-storage
              mountPath: /mnt/models
  volumeClaimTemplates:
    - metadata:
        name: data-storage
      spec:
        accessModes: ['ReadWriteOnce']
        resources:
          requests:
            storage: 100Gi
    - metadata:
        name: model-storage
      spec:
        accessModes: ['ReadWriteOnce']
        resources:
          requests:
            storage: 500Gi
```

**ODH/RHOAI Notebook Example**:

```yaml
apiVersion: kubeflow.org/v1
kind: Notebook
metadata:
  name: odh-tec-workbench
  namespace: data-science-project
spec:
  template:
    spec:
      containers:
        - name: odh-tec
          image: quay.io/rh-aiservices-bu/odh-tec:latest
          env:
            - name: LOCAL_STORAGE_PATHS
              value: '/opt/app-root/src/data,/opt/app-root/src/models'
            - name: MAX_FILE_SIZE_GB
              value: '50'
          volumeMounts:
            - name: data-pvc
              mountPath: /opt/app-root/src/data
            - name: models-pvc
              mountPath: /opt/app-root/src/models
      volumes:
        - name: data-pvc
          persistentVolumeClaim:
            claimName: workbench-data
        - name: models-pvc
          persistentVolumeClaim:
            claimName: workbench-models
```

## Success Criteria

- [ ] Local PVC directories appear in unified storage list
- [ ] Unavailable directories shown with clear indicators and tooltips
- [ ] Full CRUD operations work on local files/directories
- [ ] HuggingFace models can download to both S3 and PVCs
- [ ] Cross-storage transfers work for all combinations (S3↔Local, Local↔Local, S3↔S3)
- [ ] Multi-select operations work with keyboard shortcuts (Ctrl+A, Shift+Click)
- [ ] Conflict resolution prompts user before overwriting files
- [ ] Real-time progress updates via SSE for all transfers
- [ ] Path validation prevents all traversal attacks
- [ ] Symlinks work correctly within allowed directories
- [ ] File size limits enforced (default 20GB, configurable)
- [ ] No regression in existing S3 functionality
- [ ] Memory usage stays within 512MB during large transfers
- [ ] Comprehensive test coverage (>80% for new code)
- [ ] Documentation complete and accurate
- [ ] Works correctly in ODH/RHOAI Notebook environment

## Migration & Rollout

1. **Backward Compatibility**: Empty `LOCAL_STORAGE_PATHS` or only S3 buckets = S3-only mode (existing behavior)
2. **Feature Flag** (optional): `ENABLE_LOCAL_STORAGE=true` (default: true)
3. **Monitoring**: Log transfer metrics, error rates, file sizes
4. **Performance Testing**: Test with:
   - Large files (>10GB)
   - Many small files (thousands)
   - Concurrent operations
   - Mixed S3/local transfers
5. **Gradual Rollout**: Start with development environments, then staging, then production

## Estimated Effort

- **Phase 0** (Test Infrastructure Setup): 2-3 days
- **Phase 1** (Backend Implementation): 6-8 days
- **Phase 2** (Frontend Implementation): 6-8 days
- **Phase 3** (Testing & Documentation): 4-5 days
- **Total**: 18-24 days (~4 weeks for single developer)

## Future Enhancements

Potential features for future iterations (not in scope for initial implementation):

- **Quota Display**: Show disk usage if reliably detectable (requires non-overlay fs)
- **File Preview**: Preview local files (text, images) without downloading
- **Sync Operations**: Keep local and S3 directories synchronized
- **Compression**: Option to compress files during transfer
- **Encryption**: Option to encrypt files at rest in local storage
- **Access Control**: Per-location permissions (read-only vs read-write)
- **Search**: Search files across all storage locations
- **Favorites/Bookmarks**: Quick access to frequently used paths
- **Audit Logging**: Detailed logging for compliance requirements
- **Rate Limiting**: Per-location or per-user rate limits
- **Transfer Scheduling**: Schedule transfers for off-peak hours
- **Bandwidth Limiting**: Throttle transfer speeds to avoid network saturation
