# Phase 4: File Operations & Navigation

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 2.5 hours
**Difficulty**: Medium-High
**Dependencies**: Phase 3 (State Refactoring & Data Layer) must be complete

## Objective

Update all file operations and navigation to work with unified storage:

1. Verify/add upload progress tracking in storageService
2. Update upload to use storageService with progress
3. Update download to avoid page navigation issues
4. Update delete operations
5. Update directory creation
6. Update breadcrumb navigation
7. Update pagination controls

**Success Criteria**: All CRUD operations work for both S3 and local storage, navigation works smoothly, upload progress tracking functions

## Prerequisites

- [ ] Phase 3 completed (FileEntry interface in use)
- [ ] `selectedLocation` state available
- [ ] `files` and `directories` state working
- [ ] `refreshFiles` function operational

## Files to Modify

1. `frontend/src/app/services/storageService.ts` - Add upload progress support
2. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - File operations and navigation

## Detailed Tasks

### Task 4.1: Add Upload Progress to storageService (30 min)

**File**: `frontend/src/app/services/storageService.ts`

**Current uploadFile method** (around line 187-210):

```typescript
async uploadFile(locationId: string, path: string, file: File): Promise<void> {
  const location = await this.getLocation(locationId);
  const formData = new FormData();
  formData.append('file', file);
  // ... axios post without progress tracking
}
```

**Update to include progress callback**:

```typescript
async uploadFile(
  locationId: string,
  path: string,
  file: File,
  options?: {
    onProgress?: (percentCompleted: number) => void;
  }
): Promise<void> {
  const location = await this.getLocation(locationId);
  const formData = new FormData();
  formData.append('file', file);

  try {
    const config: any = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    };

    // Add progress tracking if callback provided
    if (options?.onProgress) {
      config.onUploadProgress = (progressEvent: any) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
        );
        options.onProgress!(percentCompleted);
      };
    }

    if (location.type === 's3') {
      await axios.post(
        `${config.backend_api_url}/objects/${locationId}/${path}`,
        formData,
        config
      );
    } else {
      await axios.post(
        `${config.backend_api_url}/local/files/${locationId}/${path}`,
        formData,
        config
      );
    }
  } catch (error) {
    console.error(`Failed to upload file to ${locationId}/${path}:`, error);
    throw error;
  }
}
```

**Verification**:

- [ ] TypeScript compiles
- [ ] Existing code still works (options parameter is optional)

---

### Task 4.2: Update Upload Functionality (40 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: File upload handler (search for "FormData" or "upload")

**Update Upload Handler**:

```typescript
const handleFileUpload = async (file: File, targetPath: string) => {
  if (!selectedLocation || !locationId) {
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Upload Failed',
      description: 'No storage location selected.',
    });
    return;
  }

  const fullPath = targetPath ? `${targetPath}/${file.name}` : file.name;

  try {
    console.log('[Upload] Starting:', {
      location: locationId,
      path: fullPath,
      size: file.size,
    });

    setUploadProgress((prev) => ({
      ...prev,
      [file.name]: 0,
    }));

    await storageService.uploadFile(locationId, btoa(fullPath), file, {
      onProgress: (percent) => {
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: percent,
        }));
      },
    });

    console.log('[Upload] Complete:', file.name);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Upload Successful',
      description: `File "${file.name}" uploaded successfully.`,
    });

    // Refresh file list
    refreshFiles(selectedLocation, currentPath, null, false);

    // Clear progress
    setUploadProgress((prev) => {
      const next = { ...prev };
      delete next[file.name];
      return next;
    });
  } catch (error: any) {
    console.error('[Upload] Failed:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Upload Failed',
      description: error.response?.data?.message || `Failed to upload "${file.name}".`,
    });

    // Clear progress on error
    setUploadProgress((prev) => {
      const next = { ...prev };
      delete next[file.name];
      return next;
    });
  }
};
```

**Add Upload Progress State** (if not exists):

```typescript
const [uploadProgress, setUploadProgress] = React.useState<Record<string, number>>({});
```

**Verification**:

- [ ] Upload shows progress bar
- [ ] Works for both S3 and local storage
- [ ] File list refreshes after upload
- [ ] Error handling works

---

### Task 4.3: Update Download to Avoid Page Navigation (25 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Download link or handler

**Create Download Helper**:

```typescript
const handleFileDownload = (file: FileEntry) => {
  if (!selectedLocation || !locationId) {
    console.error('[Download] No location selected');
    return;
  }

  console.log('[Download] Starting:', file.path);

  // Build download URL based on storage type
  const downloadUrl =
    selectedLocation.type === 's3'
      ? `${config.backend_api_url}/objects/${locationId}/${btoa(file.path)}?download=true`
      : `${config.backend_api_url}/local/download/${locationId}/${btoa(file.path)}`;

  // Use hidden link to trigger download without page navigation
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = file.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log('[Download] Triggered for:', file.name);
};
```

**Update Table Download Button**:

```typescript
// BEFORE (if using anchor tag)
<a href={`${config.backend_api_url}/objects/${bucketName}/${btoa(file.Key)}`}>
  Download
</a>

// AFTER
<Button
  variant="link"
  onClick={() => handleFileDownload(file)}
  icon={<DownloadIcon />}
  aria-label={`Download ${file.name}`}
>
  Download
</Button>
```

**Verification**:

- [ ] Download works without page navigation
- [ ] Works for both S3 and local storage
- [ ] File downloads with correct name
- [ ] No console errors

---

### Task 4.4: Update Delete Operations (25 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Delete handler (search for "delete" or "DELETE")

**Update Delete Handler**:

```typescript
const handleFileDelete = async (file: FileEntry) => {
  if (!selectedLocation || !locationId) {
    console.error('[Delete] No location selected');
    return;
  }

  try {
    console.log('[Delete] Deleting:', file.path);

    await storageService.deleteFile(locationId, btoa(file.path));

    console.log('[Delete] Success:', file.name);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Delete Successful',
      description: `"${file.name}" has been deleted.`,
    });

    // Refresh file list
    refreshFiles(selectedLocation, currentPath, null, false);
  } catch (error: any) {
    console.error('[Delete] Failed:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Delete Failed',
      description: error.response?.data?.message || `Failed to delete "${file.name}".`,
    });
  }
};
```

**For Bulk Delete** (if exists):

```typescript
const handleBulkDelete = async (selectedItems: Set<string>) => {
  if (!selectedLocation || !locationId) return;

  try {
    console.log('[BulkDelete] Deleting count:', selectedItems.size);

    await Promise.all(
      Array.from(selectedItems).map((path) => storageService.deleteFile(locationId, btoa(path))),
    );

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Delete Successful',
      description: `${selectedItems.size} item(s) deleted.`,
    });

    refreshFiles(selectedLocation, currentPath, null, false);
    setSelectedItems(new Set());
  } catch (error: any) {
    console.error('[BulkDelete] Failed:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Delete Failed',
      description: 'Failed to delete selected items.',
    });
  }
};
```

**Verification**:

- [ ] Delete works for both S3 and local storage
- [ ] Confirmation modal appears
- [ ] File list refreshes after delete
- [ ] Error handling works

---

### Task 4.5: Update Directory Creation (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Create folder/directory handler

**Update Handler**:

```typescript
const handleCreateDirectory = async (directoryName: string) => {
  if (!selectedLocation || !locationId) {
    console.error('[CreateDir] No location selected');
    return;
  }

  const fullPath = currentPath ? `${currentPath}/${directoryName}` : directoryName;

  try {
    console.log('[CreateDir] Creating:', fullPath);

    await storageService.createDirectory(locationId, btoa(fullPath));

    console.log('[CreateDir] Success:', directoryName);

    Emitter.emit('notification', {
      variant: 'success',
      title: 'Directory Created',
      description: `Directory "${directoryName}" created successfully.`,
    });

    // Refresh file list
    refreshFiles(selectedLocation, currentPath, null, false);

    // Close modal
    setIsCreateFolderModalOpen(false);
    setNewFolderName('');
  } catch (error: any) {
    console.error('[CreateDir] Failed:', error);
    Emitter.emit('notification', {
      variant: 'danger',
      title: 'Creation Failed',
      description:
        error.response?.data?.message || `Failed to create directory "${directoryName}".`,
    });
  }
};
```

**Verification**:

- [ ] Directory creation works for both S3 and local storage
- [ ] Works in root and subdirectories
- [ ] File list refreshes to show new directory
- [ ] Error handling works

---

### Task 4.6: Update Breadcrumb Navigation (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Breadcrumb rendering

**Update Breadcrumb Implementation**:

```typescript
// Split current path into segments
const pathParts = currentPath.split('/').filter(Boolean);

// Render breadcrumbs
<Breadcrumb>
  {/* Root breadcrumb - location name */}
  <BreadcrumbItem>
    <Button
      variant="link"
      onClick={handlePathClick('')}
      aria-label={`Navigate to ${selectedLocation?.name || locationId} root`}
    >
      {selectedLocation?.name || locationId}
      {selectedLocation && ` (${selectedLocation.type.toUpperCase()})`}
    </Button>
  </BreadcrumbItem>

  {/* Path segment breadcrumbs */}
  {pathParts.map((part, index) => {
    const pathUpToHere = pathParts.slice(0, index + 1).join('/');
    const isLast = index === pathParts.length - 1;

    return (
      <BreadcrumbItem key={pathUpToHere} isActive={isLast}>
        {isLast ? (
          <span>{part}</span>
        ) : (
          <Button
            variant="link"
            onClick={handlePathClick(pathUpToHere)}
            aria-label={`Navigate to ${part}`}
          >
            {part}
          </Button>
        )}
      </BreadcrumbItem>
    );
  })}
</Breadcrumb>
```

**Ensure handlePathClick exists** (from Phase 3):

```typescript
const handlePathClick = (newPath: string) => (event?: React.MouseEvent) => {
  if (event) event.preventDefault();

  setFiles([]);
  setDirectories([]);
  setCurrentPath(newPath);
  setPaginationToken(null);
  setPaginationOffset(0);
  setIsTruncated(false);

  navigate(newPath !== '' ? `/browse/${locationId}/${btoa(newPath)}` : `/browse/${locationId}`);
};
```

**Verification**:

- [ ] Breadcrumb shows location name (not just ID)
- [ ] Breadcrumb shows storage type indicator
- [ ] Path segments are clickable (except last)
- [ ] Clicking breadcrumb navigates correctly
- [ ] Works for both S3 and local storage

---

### Task 4.7: Update Pagination Display (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Pagination text/display

**Update Display**:

```typescript
// Pagination info text
<Text>
  Showing {files.length} file(s) and {directories.length} folder(s)
  {isTruncated && (
    <span> - <strong>More available</strong></span>
  )}
</Text>

// Load More button
{isTruncated && (
  <Button
    variant="secondary"
    onClick={handleLoadMore}
    isDisabled={isLoadingMore || !selectedLocation?.available}
    isLoading={isLoadingMore}
  >
    {isLoadingMore ? 'Loading...' : 'Load More'}
  </Button>
)}
```

**Verify handleLoadMore** (from Phase 3):

```typescript
const handleLoadMore = () => {
  if (!isTruncated || isLoadingMore || !selectedLocation) return;

  setIsLoadingMore(true);

  if (selectedLocation.type === 's3') {
    refreshFiles(selectedLocation, currentPath, paginationToken, true).finally(() =>
      setIsLoadingMore(false),
    );
  } else {
    refreshFiles(selectedLocation, currentPath, null, true).finally(() => setIsLoadingMore(false));
  }
};
```

**Verification**:

- [ ] Shows correct counts
- [ ] "Load More" button appears when hasMore
- [ ] Loading state shows during fetch
- [ ] Works for both pagination styles

---

## Verification Steps

### Automated Checks

```bash
cd frontend

npm run type-check
npm run build

# Verify storageService upload signature
grep -A 10 "async uploadFile" src/app/services/storageService.ts
```

### Manual Testing

**Upload Operations**:

1. Upload to S3 location:

   - [ ] Shows progress bar
   - [ ] File appears in list after upload
   - [ ] Works in root and subdirectories

2. Upload to local location:
   - [ ] Shows progress bar
   - [ ] File appears in list after upload

**Download Operations**: 3. Download from S3:

- [ ] File downloads
- [ ] No page navigation
- [ ] Correct filename

4. Download from local storage:
   - [ ] File downloads
   - [ ] No page navigation

**Delete Operations**: 5. Delete from S3:

- [ ] Confirmation modal
- [ ] File removed from list

6. Delete from local:
   - [ ] Confirmation modal
   - [ ] File removed from list

**Directory Operations**: 7. Create directory in S3:

- [ ] Directory appears in list
- [ ] Can navigate into it

8. Create directory in local storage:
   - [ ] Directory appears in list

**Navigation**: 9. Breadcrumb navigation:

- [ ] Shows location name
- [ ] Path segments clickable
- [ ] Navigation works

10. Pagination:

- [ ] "Load More" appears when needed
- [ ] Loads additional files
- [ ] Works for both storage types

---

## Checklist Before Marking Complete

- [ ] Upload progress tracking added to storageService
- [ ] Upload works for both storage types with progress
- [ ] Download avoids page navigation
- [ ] Delete works for both storage types
- [ ] Directory creation works for both types
- [ ] Breadcrumbs show location name and path
- [ ] Pagination controls work correctly
- [ ] TypeScript compiles with no errors
- [ ] All manual tests pass
- [ ] Console logs show correct behavior
- [ ] No runtime errors

---

## Estimated Time Breakdown

- Task 4.1 (Upload progress): 30 min
- Task 4.2 (Update upload): 40 min
- Task 4.3 (Update download): 25 min
- Task 4.4 (Update delete): 25 min
- Task 4.5 (Directory creation): 20 min
- Task 4.6 (Breadcrumbs): 30 min
- Task 4.7 (Pagination): 20 min
- **Total**: ~2.5 hours

---

## Next Phase

After completing Phase 4, proceed to:
**Phase 5: Integration Points & Polish** (`objectbrowser-phase5-integration.md`)
