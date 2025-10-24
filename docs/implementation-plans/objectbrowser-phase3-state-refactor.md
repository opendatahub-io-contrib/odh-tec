# Phase 3: State Refactoring & Data Layer

**Part of**: ObjectBrowser Unified Storage Integration
**Estimated Time**: 3 hours
**Difficulty**: High
**Dependencies**: Phase 2 (Location Loading & Selection) must be complete

## Objective

Refactor component state and data layer to be storage-agnostic:

1. Rename all S3-specific state variables to storage-agnostic names
2. Replace `refreshObjects()` with unified `refreshFiles()` function
3. Refactor table rendering to use FileEntry interface directly
4. Update search/filter logic for FileEntry fields
5. Remove old S3-specific state and functions

**Success Criteria**: File listing works for both S3 and local storage using unified state and FileEntry interface

## Prerequisites

- [ ] Phase 1 completed (URL pattern updated)
- [ ] Phase 2 completed (Location loading working)
- [ ] Understand FileEntry interface in `storageService.ts`
- [ ] Review current `refreshObjects()` in `objectBrowserFunctions.ts`

## Files to Modify

1. `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - Main component (extensive changes)
2. `frontend/src/app/components/ObjectBrowser/objectBrowserTypes.ts` - Add FileEntry import
3. `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts` - Eventually deprecate

## State Variable Mapping

| Old Name (S3-specific)  | New Name (Storage-agnostic) | Type             |
| ----------------------- | --------------------------- | ---------------- |
| `s3Objects`             | `files`                     | `FileEntry[]`    |
| `s3Prefixes`            | `directories`               | `FileEntry[]`    |
| `nextContinuationToken` | `paginationToken`           | `string \| null` |
| `decodedPrefix`         | `currentPath`               | `string`         |
| `isTruncated`           | Keep same                   | `boolean`        |
| (new)                   | `paginationOffset`          | `number`         |

## Detailed Tasks

### Task 3.1: Import FileEntry Type (5 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

Add to imports:

```typescript
import { storageService, StorageLocation, FileEntry } from '@app/services/storageService';
```

Or if FileEntry is in types file:

```typescript
import type { FileEntry } from '@app/services/storageService';
```

---

### Task 3.2: Rename State Variables (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Strategy**: Use Find & Replace in IDE (case-sensitive)

**Renames** (in order, to avoid conflicts):

1. **s3Objects → files**:

```typescript
// FIND:    const [s3Objects, setS3Objects]
// REPLACE: const [files, setFiles]

// FIND:    React.useState<S3Objects | null>(null)
// REPLACE: React.useState<FileEntry[]>([])
```

2. **s3Prefixes → directories**:

```typescript
// FIND:    const [s3Prefixes, setS3Prefixes]
// REPLACE: const [directories, setDirectories]

// FIND:    React.useState<S3Prefixes | null>(null)
// REPLACE: React.useState<FileEntry[]>([])
```

3. **nextContinuationToken → paginationToken**:

```typescript
// FIND:    const [nextContinuationToken, setNextContinuationToken]
// REPLACE: const [paginationToken, setPaginationToken]
```

4. **decodedPrefix → currentPath**:

```typescript
// FIND:    const [decodedPrefix, setDecodedPrefix]
// REPLACE: const [currentPath, setCurrentPath]
```

5. **Add paginationOffset**:

```typescript
const [paginationOffset, setPaginationOffset] = React.useState(0);
```

**Important**: After each rename, verify TypeScript compiles before proceeding to next

---

### Task 3.3: Create Unified refreshFiles Function (60 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: `refreshObjects` function (likely defined externally or imported)

**Create New Function** (add to component):

```typescript
const refreshFiles = React.useCallback(
  async (
    location: StorageLocation,
    path: string,
    continuationToken?: string | null,
    appendResults: boolean = false,
    searchParams?: { q: string; mode: 'startsWith' | 'contains' },
    abortController?: AbortController,
  ): Promise<void> => {
    if (!location) {
      console.warn('[refreshFiles] No location provided');
      return;
    }

    try {
      console.log('[refreshFiles] Loading files:', {
        location: location.id,
        path,
        type: location.type,
        append: appendResults,
      });

      let response;

      if (location.type === 's3') {
        // S3: Use continuation token pagination
        response = await storageService.listFiles(location.id, path, {
          continuationToken: continuationToken || undefined,
          maxKeys: searchParams ? undefined : 1000,
        });

        // Update S3 pagination state
        setPaginationToken(response.nextContinuationToken || null);
        setIsTruncated(response.isTruncated || false);
      } else {
        // Local storage: Use offset pagination
        const offset = appendResults ? paginationOffset : 0;

        response = await storageService.listFiles(location.id, path, {
          limit: 1000,
          offset,
        });

        // Update local pagination state
        const hasMore = response.totalCount! > offset + response.files.length;
        setIsTruncated(hasMore);

        // Update offset for next page
        if (appendResults) {
          setPaginationOffset(offset + response.files.length);
        } else {
          setPaginationOffset(response.files.length);
        }
      }

      // Separate files and directories from FileEntry array
      const dirEntries = response.files.filter((f) => f.type === 'directory');
      const fileEntries = response.files.filter((f) => f.type === 'file');

      console.log('[refreshFiles] Results:', {
        files: fileEntries.length,
        directories: dirEntries.length,
        hasMore: hasMore || response.isTruncated,
      });

      if (appendResults) {
        // Append to existing results (pagination)
        setDirectories((prev) => [...prev, ...dirEntries]);
        setFiles((prev) => [...prev, ...fileEntries]);
      } else {
        // Replace results (new path or refresh)
        setDirectories(dirEntries);
        setFiles(fileEntries);
      }

      setCurrentPath(path);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.name === 'CanceledError') {
        console.log('[refreshFiles] Request aborted');
        return;
      }

      console.error('[refreshFiles] Failed:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Error Loading Files',
        description: error.response?.data?.message || 'Failed to load files from storage.',
      });

      // Clear results on error
      setDirectories([]);
      setFiles([]);
    }
  },
  [paginationOffset],
); // Dependencies: only paginationOffset (others are setters)
```

**Key Features**:

- Unified interface for both S3 and local storage
- Proper pagination handling for each type
- FileEntry interface used directly
- Error handling with notifications
- Append mode for "Load More" functionality
- Console logging for debugging

---

### Task 3.4: Replace refreshObjects Calls (45 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find All**: Search for `refreshObjects(` calls

**Replace Pattern**:

```typescript
// BEFORE
refreshObjects(
  bucketName,
  prefix || '',
  setDecodedPrefix,
  setS3Objects,
  setS3Prefixes,
  setNextContinuationToken,
  setIsTruncated,
  continuationToken,
  append,
  searchParams,
  abortController,
);

// AFTER
if (selectedLocation && selectedLocation.available) {
  refreshFiles(
    selectedLocation,
    path || '',
    paginationToken,
    append,
    searchParams,
    abortController,
  );
}
```

**Common Locations**:

1. Initial file loading (useEffect)
2. Path navigation
3. Refresh button
4. Search functionality
5. Load More button

**Important**:

- Always check `selectedLocation` exists and is available
- Use `path` instead of `prefix`
- Use `paginationToken` instead of `nextContinuationToken`
- No need to pass setters (handled internally)

---

### Task 3.5: Update Initial Loading Effect (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: useEffect that calls `refreshObjects` or `loadBuckets`

**Replace With**:

```typescript
// Load files when location or path changes
React.useEffect(() => {
  if (!selectedLocation) {
    console.log('[ObjectBrowser] No location selected, skipping file load');
    return;
  }

  if (!selectedLocation.available) {
    console.warn('[ObjectBrowser] Location unavailable, showing empty view');
    setDirectories([]);
    setFiles([]);
    return;
  }

  console.log('[ObjectBrowser] Loading files for location:', selectedLocation.id);

  // Reset pagination
  setPaginationToken(null);
  setPaginationOffset(0);
  setIsTruncated(false);

  // Load files
  refreshFiles(
    selectedLocation,
    path || '',
    null,
    false,
    undefined,
    abortControllerRef.current || undefined,
  );
}, [selectedLocation, path, refreshFiles]);
```

---

### Task 3.6: Refactor Table Rendering - Directory Rows (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Directory/prefix rendering (search for "s3Prefixes" or folder icon)

**Before** (S3-style):

```typescript
{s3Prefixes?.s3Prefixes.map((prefix) => (
  <Tr key={prefix.Prefix}>
    <Td>{prefix.Prefix}</Td>
    <Td>-</Td>
    <Td>-</Td>
  </Tr>
))}
```

**After** (FileEntry-style):

```typescript
{directories.map((dir) => (
  <Tr key={dir.path}>
    <Td dataLabel="Name">
      <Button
        variant="link"
        onClick={handlePathClick(dir.path)}
        icon={<FolderIcon />}
      >
        {dir.name}
      </Button>
    </Td>
    <Td dataLabel="Last Modified">
      {dir.modified ? new Date(dir.modified).toLocaleString() : '-'}
    </Td>
    <Td dataLabel="Size">-</Td>
  </Tr>
))}
```

**Key Changes**:

- Use `directories` array (FileEntry[])
- Access `dir.name` for display name
- Access `dir.path` for full path
- Use `dir.modified` (Date object)
- `handlePathClick` instead of `handlePrefixClick`

---

### Task 3.7: Refactor Table Rendering - File Rows (30 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: File/object rendering (search for "s3Objects" or file mapping)

**Before** (S3-style):

```typescript
{s3Objects?.s3Objects.map((obj) => (
  <Tr key={obj.Key}>
    <Td>{obj.Key}</Td>
    <Td>{obj.LastModified}</Td>
    <Td>{obj.Size}</Td> {/* Already formatted */}
  </Tr>
))}
```

**After** (FileEntry-style):

```typescript
{files.map((file) => (
  <Tr key={file.path}>
    <Td dataLabel="Name">
      <Button
        variant="link"
        onClick={() => handleFileClick(file)}
      >
        {file.name}
      </Button>
    </Td>
    <Td dataLabel="Last Modified">
      {file.modified ? new Date(file.modified).toLocaleString() : '-'}
    </Td>
    <Td dataLabel="Size">
      {file.size ? formatBytes(file.size) : '-'}
    </Td>
  </Tr>
))}
```

**Key Changes**:

- Use `files` array (FileEntry[])
- Access `file.name` for display name
- Access `file.path` for full path
- Access `file.modified` (Date object, format at render time)
- Access `file.size` (number, format with formatBytes())
- Move formatBytes() to render time (keep numeric value in state)

**Ensure formatBytes helper exists**:

```typescript
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};
```

---

### Task 3.8: Update Search/Filter Logic (20 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: Search filtering (search for "filter" or "search")

**Before** (S3-style):

```typescript
const filteredObjects =
  s3Objects?.s3Objects.filter((obj) => obj.Key.toLowerCase().includes(searchText.toLowerCase())) ||
  [];

const filteredPrefixes =
  s3Prefixes?.s3Prefixes.filter((prefix) =>
    prefix.Prefix.toLowerCase().includes(searchText.toLowerCase()),
  ) || [];
```

**After** (FileEntry-style):

```typescript
const filteredFiles = files.filter(
  (file) =>
    file.name.toLowerCase().includes(searchText.toLowerCase()) ||
    file.path.toLowerCase().includes(searchText.toLowerCase()),
);

const filteredDirectories = directories.filter(
  (dir) =>
    dir.name.toLowerCase().includes(searchText.toLowerCase()) ||
    dir.path.toLowerCase().includes(searchText.toLowerCase()),
);
```

**Use Filtered Arrays in Rendering**:

```typescript
{filteredDirectories.map((dir) => (/* ... */))}
{filteredFiles.map((file) => (/* ... */))}
```

---

### Task 3.9: Update handlePathClick (formerly handlePrefixClick) (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: `handlePrefixClick` function

**Rename and Update**:

```typescript
// BEFORE
const handlePrefixClick = (plainTextPrefix: string) => {
  setS3Objects(null);
  setS3Prefixes(null);
  setDecodedPrefix(plainTextPrefix);
  setNextContinuationToken(null);
  setIsTruncated(false);
  setSearchObjectText('');
  navigate(/* ... */);
};

// AFTER
const handlePathClick = (newPath: string) => (event?: React.MouseEvent) => {
  if (event) event.preventDefault();

  console.log('[handlePathClick] Navigating to path:', newPath);

  // Clear current results
  setFiles([]);
  setDirectories([]);
  setCurrentPath(newPath);

  // Reset pagination
  setPaginationToken(null);
  setPaginationOffset(0);
  setIsTruncated(false);

  // Clear search
  setSearchObjectText('');

  // Navigate
  navigate(newPath !== '' ? `/browse/${locationId}/${btoa(newPath)}` : `/browse/${locationId}`);
};
```

**Update All Callers**:

```typescript
// From
onClick={handlePrefixClick(prefix)}

// To
onClick={handlePathClick(dir.path)}
```

---

### Task 3.10: Update Load More Handler (15 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Find**: `handleLoadMore` function

**Update**:

```typescript
const handleLoadMore = () => {
  if (!isTruncated || isLoadingMore || !selectedLocation) {
    return;
  }

  console.log('[handleLoadMore] Loading more results');
  setIsLoadingMore(true);

  if (selectedLocation.type === 's3') {
    // S3: Use continuation token
    refreshFiles(
      selectedLocation,
      currentPath,
      paginationToken,
      true, // append results
      serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
      abortControllerRef.current || undefined,
    ).finally(() => setIsLoadingMore(false));
  } else {
    // Local: Use offset (already tracked in state)
    refreshFiles(
      selectedLocation,
      currentPath,
      null,
      true, // append results
      undefined,
      abortControllerRef.current || undefined,
    ).finally(() => setIsLoadingMore(false));
  }
};
```

---

### Task 3.11: Remove Old State and Functions (10 min)

**File**: `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`

**Remove**:

1. Old state variables (if not already replaced):

   - `bucketsList`, `setBucketsList`
   - `formSelectBucket`, `setFormSelectBucket`

2. Old function imports:

   - Remove `import { loadBuckets, refreshObjects } from './objectBrowserFunctions'`

3. Old bucket loading code:
   - Remove any remaining calls to `loadBuckets()`

**Verify**:

- [ ] No references to `s3Objects`, `s3Prefixes`, `nextContinuationToken`, `decodedPrefix`
- [ ] No references to `bucketsList`, `loadBuckets`, `refreshObjects`
- [ ] All replaced with new state and functions

---

## Verification Steps

### Automated Checks

```bash
cd frontend

# Type check
npm run type-check

# Build
npm run build

# Code search - should find NO matches:
grep -r "s3Objects" src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -r "s3Prefixes" src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -r "nextContinuationToken" src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -r "decodedPrefix" src/app/components/ObjectBrowser/ObjectBrowser.tsx
grep -r "refreshObjects" src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

### Manual Testing

1. **Browse S3 Location**:

   - Select S3 bucket from dropdown
   - Verify files and directories display correctly
   - Click directory → navigate into it
   - Click breadcrumb → navigate back
   - Test "Load More" if >1000 items

2. **Browse Local Location**:

   - Select local storage from dropdown
   - Verify files and directories display correctly
   - Navigate through directories
   - Test pagination

3. **Search Functionality**:

   - Type in search box
   - Verify filtering works on both name and path
   - Verify works for both files and directories

4. **Console Verification**:
   - Check console for "[refreshFiles]" logs
   - Verify shows correct pagination type
   - No errors in console

---

## Common Issues & Solutions

### Issue 1: "files.map is not a function"

**Cause**: `files` is null or undefined
**Solution**: Initialize as empty array: `useState<FileEntry[]>([])`

### Issue 2: "Cannot read property 'name' of undefined"

**Cause**: FileEntry structure not matching
**Solution**: Verify storageService returns correct FileEntry format

### Issue 3: Table shows nothing

**Cause**: refreshFiles not being called OR response empty
**Solution**: Check console logs, verify backend returns data

### Issue 4: Pagination not working

**Cause**: Wrong pagination token/offset for storage type
**Solution**: Verify S3 uses `paginationToken`, local uses `paginationOffset`

---

## Rollback Instructions

Phase 3 has extensive changes. If issues occur:

1. **Create backup branch**:

```bash
git checkout -b phase3-backup
git checkout main
```

2. **Revert specific changes**:

```bash
git checkout HEAD~1 -- frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx
```

---

## Checklist Before Marking Complete

- [ ] All state variables renamed
- [ ] `refreshFiles` function created and tested
- [ ] All `refreshObjects` calls replaced
- [ ] Table rendering uses FileEntry interface
- [ ] Search/filter uses FileEntry fields
- [ ] Pagination works for both S3 and local
- [ ] Old S3-specific code removed
- [ ] TypeScript compiles with no errors
- [ ] Manual testing passes for both storage types
- [ ] Console logs show correct behavior
- [ ] No references to old variable names

---

## Estimated Time Breakdown

- Task 3.1: 5 min
- Task 3.2: 30 min
- Task 3.3: 60 min
- Task 3.4: 45 min
- Task 3.5: 20 min
- Task 3.6: 30 min
- Task 3.7: 30 min
- Task 3.8: 20 min
- Task 3.9: 15 min
- Task 3.10: 15 min
- Task 3.11: 10 min
- **Total**: ~3 hours

---

## Next Phase

After completing Phase 3, proceed to:
**Phase 4: File Operations & Navigation** (`objectbrowser-phase4-operations.md`)
