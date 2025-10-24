# ObjectBrowser Unified Storage Integration Plan (Revised v2)

## Overview

This document outlines the **revised** plan to refactor the `ObjectBrowser` component to work with both S3 buckets and local PVC storage, using the unified `StorageService` interface.

**Status**: Planning Phase - Revised
**Target Completion**: Phase 2 of PVC Storage Support Feature
**Estimated Effort**: ~8 hours (revised from 6 hours)

**Revision Notes**: This v2 plan incorporates architectural decisions for cleaner abstraction:

- Simplified URL pattern (no explicit `storageType` parameter)
- Renamed state variables to storage-agnostic names
- Direct use of FileEntry interface (no S3-style mapping)
- Additional steps for error handling and edge cases

## Problem Statement

The `ObjectBrowser` component (`frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`) is currently hardcoded to work only with S3 buckets. Even though:

1. ✅ Backend correctly supports both S3 and local storage with appropriate pagination
2. ✅ `StorageService` has been updated to support both pagination styles
3. ❌ ObjectBrowser still uses S3-specific functions and UI

**Success Criteria**: Users can browse, upload, download, and delete files in both S3 buckets and local PVC storage through the same unified UI.

## Architectural Decisions

### URL Pattern

**Decision**: `/browse/:locationId/:path?`

- Storage type is derived from location lookup
- Simpler, single source of truth
- No validation needed between storageType and locationId

### State Variable Naming

**Decision**: Rename all S3-specific names to storage-agnostic equivalents

- `s3Objects` → `files`
- `s3Prefixes` → `directories`
- `nextContinuationToken` → `paginationToken`
- `localOffset` → `paginationOffset`
- `isTruncated` → Keep (already agnostic, means "has more results")

### Data Structure

**Decision**: Use FileEntry interface directly in state

- No mapping to S3-style `{Key, LastModified, Size}` structure
- Store FileEntry objects: `{name, path, type, size, modified, target?}`
- Update table renderers to use FileEntry fields

### URL Migration

**Decision**: Break old URLs (no migration route)

- Old `/objects/:bucketName/:prefix?` URLs will 404
- Users need to re-navigate from locations list
- Simpler implementation, cleaner codebase

## Current State Analysis

### Hardcoded S3 Dependencies in ObjectBrowser

1. **URL Parameters**: Uses `bucketName` and `prefix` (S3 concepts)

   - Location: `const { bucketName } = useParams<{ bucketName: string }>();`
   - Line: ~124

2. **Bucket Loading**: Calls `loadBuckets()` which only fetches S3 buckets

   - Location: `loadBuckets()` from `objectBrowserFunctions.ts`
   - Lines: 151-164

3. **File Listing**: Uses `refreshObjects()` which is S3-specific

   - Location: Multiple calls throughout component
   - Uses S3 pagination: `nextContinuationToken`, `isTruncated`

4. **File Operations**: Direct S3 endpoint calls

   - Upload: `/objects/upload/${bucketName}/...`
   - Download: `/objects/download/${bucketName}/...`
   - Delete: `/objects/${bucketName}/...`

5. **UI Labels**: Hardcoded "S3 Objects Browser"

   - Line: 1300

6. **State Variables**: S3-specific naming throughout

## Implementation Plan

### Step 0: Update Default Routes

**Estimated Time**: 15 minutes

**Changes Required**:

1. Update `routes.tsx` default redirects:

```typescript
// BEFORE (lines 61-64, 72-74)
{
  element: <Navigate to="/objects/:bucketName/:prefix?" />,
  path: '/',
  title: 'Redirect',
}

// AFTER
{
  element: <Navigate to="/browse" />,
  path: '/',
  title: 'Redirect',
}
```

2. Add handling in ObjectBrowser for no locationId (show location picker)

### Step 1: Update URL Routing and Parameters

**Estimated Time**: 20 minutes

**Current Route Pattern**:

```
/objects/:bucketName/:prefix?
```

**New Route Pattern**:

```
/browse/:locationId/:path?
```

**Changes Required**:

1. Update `routes.tsx` to use new pattern:

```typescript
// BEFORE
{
  element: <ObjectBrowser />,
  label: 'Object Browser',
  path: '/objects/:bucketName/:prefix?',
  title: 'Object Browser',
}

// AFTER
{
  element: <ObjectBrowser />,
  label: 'Storage Browser',
  path: '/browse/:locationId?/:path?',
  title: 'Storage Browser',
}
```

2. Update URL parameter extraction in ObjectBrowser:

```typescript
// BEFORE
const { bucketName } = useParams<{ bucketName: string }>();
const { prefix } = useParams<{ prefix: string }>();

// AFTER
const { locationId, path } = useParams<{
  locationId?: string;
  path?: string;
}>();
```

3. Update all `navigate()` calls to use new pattern:

```typescript
// BEFORE
navigate(`/objects/${bucketName}/${btoa(prefix)}`);

// AFTER
navigate(`/browse/${locationId}/${btoa(path)}`);
```

### Step 2: Replace Bucket Loading with Location Loading

**Estimated Time**: 45 minutes

**Changes Required**:

1. Replace bucket-specific state with unified locations:

```typescript
// BEFORE
const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
const [formSelectBucket, setFormSelectBucket] = React.useState(bucketName);

// AFTER
const [locations, setLocations] = React.useState<StorageLocation[]>([]);
const [selectedLocation, setSelectedLocation] = React.useState<StorageLocation | null>(null);
const [formSelectLocation, setFormSelectLocation] = React.useState(locationId || '');
```

2. Load all storage locations on mount:

```typescript
// Load all storage locations (S3 + local)
React.useEffect(() => {
  storageService
    .getLocations()
    .then(setLocations)
    .catch((error) => {
      console.error('Failed to load storage locations:', error);
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Error Loading Locations',
        description: 'Failed to load storage locations.',
      });
    });
}, []);
```

3. Set selected location from URL parameters:

```typescript
React.useEffect(() => {
  if (locationId && locations.length > 0) {
    const location = locations.find((loc) => loc.id === locationId);

    if (!location) {
      // Location not found
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Location Not Found',
        description: `Storage location "${locationId}" does not exist.`,
      });
      navigate('/browse');
      return;
    }

    if (!location.available) {
      // Location unavailable
      Emitter.emit('notification', {
        variant: 'warning',
        title: 'Location Unavailable',
        description: `Storage location "${location.name}" is currently unavailable.`,
      });
    }

    setSelectedLocation(location);
  } else if (!locationId && locations.length > 0) {
    // No location selected, redirect to first available
    const firstAvailable = locations.find((loc) => loc.available);
    if (firstAvailable) {
      navigate(`/browse/${firstAvailable.id}`);
    }
  }
}, [locationId, locations, navigate]);
```

4. Update location selector dropdown:

```typescript
// BEFORE
<FormSelect
  value={formSelectBucket}
  onChange={handleBucketSelectorChange}
>
  {bucketsList?.buckets.map((bucket) => (
    <FormSelectOption key={bucket.Name} value={bucket.Name} label={bucket.Name} />
  ))}
</FormSelect>

// AFTER
<FormSelect
  value={formSelectLocation}
  onChange={handleLocationSelectorChange}
  aria-label="Select storage location"
>
  {locations.map((loc) => (
    <FormSelectOption
      key={loc.id}
      value={loc.id}
      label={`${loc.name} (${loc.type.toUpperCase()})`}
      isDisabled={!loc.available}
    />
  ))}
</FormSelect>
```

5. Update selector change handler:

```typescript
const handleLocationSelectorChange = (
  _event: React.FormEvent<HTMLSelectElement>,
  value: string,
) => {
  setFormSelectLocation(value);
  navigate(`/browse/${value}`);
};
```

### Step 3: Rename State Variables and Create Unified File Listing Function

**Estimated Time**: 2.5 hours

**Changes Required**:

1. Rename all state variables:

```typescript
// BEFORE
const [s3Objects, setS3Objects] = React.useState<S3Objects | null>(null);
const [s3Prefixes, setS3Prefixes] = React.useState<S3Prefixes | null>(null);
const [nextContinuationToken, setNextContinuationToken] = React.useState<string | null>(null);
const [isTruncated, setIsTruncated] = React.useState(false);
const [decodedPrefix, setDecodedPrefix] = React.useState('');

// AFTER
const [files, setFiles] = React.useState<FileEntry[]>([]);
const [directories, setDirectories] = React.useState<FileEntry[]>([]);
const [paginationToken, setPaginationToken] = React.useState<string | null>(null);
const [paginationOffset, setPaginationOffset] = React.useState(0);
const [isTruncated, setIsTruncated] = React.useState(false);
const [currentPath, setCurrentPath] = React.useState('');
```

2. Create new unified listing function to replace `refreshObjects()`:

```typescript
const refreshFiles = async (
  location: StorageLocation,
  path: string,
  continuationToken?: string,
  appendResults: boolean = false,
  searchParams?: { q: string; mode: 'startsWith' | 'contains' },
  abortController?: AbortController,
): Promise<void> => {
  try {
    let response;

    if (location.type === 's3') {
      // Use S3 pagination with continuation token
      response = await storageService.listFiles(location.id, path, {
        continuationToken,
        maxKeys: searchParams ? undefined : 1000,
      });

      // Update S3-specific pagination state
      setPaginationToken(response.nextContinuationToken || null);
      setIsTruncated(response.isTruncated || false);
    } else {
      // Use local storage pagination with offset
      const offset = appendResults ? paginationOffset : 0;
      response = await storageService.listFiles(location.id, path, {
        limit: 1000,
        offset,
      });

      // For local storage, check if more results available
      const hasMore = response.totalCount! > offset + response.files.length;
      setIsTruncated(hasMore);

      // Update offset for next load
      if (appendResults) {
        setPaginationOffset(offset + response.files.length);
      } else {
        setPaginationOffset(response.files.length);
      }
    }

    // Separate files and directories from FileEntry array
    const dirEntries = response.files.filter((f) => f.type === 'directory');
    const fileEntries = response.files.filter((f) => f.type === 'file');

    if (appendResults) {
      // Append to existing results
      setDirectories((prev) => [...prev, ...dirEntries]);
      setFiles((prev) => [...prev, ...fileEntries]);
    } else {
      // Replace results
      setDirectories(dirEntries);
      setFiles(fileEntries);
    }

    setCurrentPath(path);
  } catch (error: any) {
    if (error.name === 'AbortError' || error.name === 'CanceledError') {
      return;
    }
    console.error('Failed to list files:', error);
    Emitter.emit('notification', {
      variant: 'warning',
      title: 'Error Loading Files',
      description: error.response?.data?.message || 'Failed to load files.',
    });
  }
};
```

3. Update all calls to `refreshObjects()` to use `refreshFiles()` instead, passing `selectedLocation` instead of `bucketName`.

4. Update refresh trigger effect:

```typescript
// BEFORE
React.useEffect(() => {
  if (bucketName && bucketName !== ':bucketName') {
    refreshObjects(
      bucketName,
      prefix || '',
      setDecodedPrefix,
      setS3Objects,
      setS3Prefixes /* ... */,
    );
  }
}, [location, bucketName]);

// AFTER
React.useEffect(() => {
  if (selectedLocation && selectedLocation.available) {
    refreshFiles(
      selectedLocation,
      path || '',
      undefined,
      false,
      undefined,
      abortControllerRef.current || undefined,
    );
  }
}, [location, selectedLocation]);
```

### Step 3.1: Refactor Table Cell Renderers for FileEntry Interface

**Estimated Time**: 30 minutes

**Changes Required**:

1. Update table column definitions to use FileEntry fields:

```typescript
// BEFORE
const columnNames = {
  name: 'Name',
  lastModified: 'Last Modified',
  size: 'Size',
};

// Table cells use row.Key, row.LastModified, row.Size

// AFTER
const columnNames = {
  name: 'Name',
  modified: 'Last Modified',
  size: 'Size',
};

// Table cells use row.name, row.path, row.modified, row.size
```

2. Update table row rendering:

```typescript
// Directory rows
{directories.map((dir) => (
  <Tr key={dir.path}>
    <Td dataLabel={columnNames.name}>
      <Button
        variant="link"
        onClick={handlePathClick(dir.path)}
        icon={<FolderIcon />}
      >
        {dir.name}
      </Button>
    </Td>
    <Td dataLabel={columnNames.modified}>
      {dir.modified ? new Date(dir.modified).toLocaleString() : '-'}
    </Td>
    <Td dataLabel={columnNames.size}>-</Td>
  </Tr>
))}

// File rows
{files.map((file) => (
  <Tr key={file.path}>
    <Td dataLabel={columnNames.name}>
      <Button
        variant="link"
        onClick={() => handleFileViewClick(file)}
      >
        {file.name}
      </Button>
    </Td>
    <Td dataLabel={columnNames.modified}>
      {file.modified ? new Date(file.modified).toLocaleString() : '-'}
    </Td>
    <Td dataLabel={columnNames.size}>
      {file.size ? formatBytes(file.size) : '-'}
    </Td>
  </Tr>
))}
```

3. Move `formatBytes()` calls to render time (keep numeric values in state).

4. Update search/filter logic to work with FileEntry fields:

```typescript
// BEFORE
const filteredRows =
  s3Objects?.s3Objects.filter((obj) => obj.Key.toLowerCase().includes(searchText.toLowerCase())) ||
  [];

// AFTER
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

### Step 4: Update File Operations

**Estimated Time**: 2.5 hours

**Changes Required**:

1. Update file upload to use `storageService`:

```typescript
// BEFORE
const formData = new FormData();
formData.append('file', file);
axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(fullPath)}`, formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (progressEvent) => {
    // Upload progress tracking
    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total!);
    setUploadProgress(percentCompleted);
  },
});

// AFTER
await storageService.uploadFile(locationId!, fullPath, file, {
  onProgress: (percentCompleted) => {
    setUploadProgress(percentCompleted);
  },
});
```

**Note**: This requires verifying that `storageService.uploadFile()` supports progress callbacks. If not, we need to:

- Option A: Add progress callback parameter to `storageService.uploadFile()`
- Option B: Keep direct axios calls in ObjectBrowser for uploads only

2. Update file download to use better implementation:

```typescript
// BEFORE
<a href={`${config.backend_api_url}/objects/download/${bucketName}/${btoa(row.key)}`}>
  Download
</a>

// AFTER - Create helper function
const handleDownload = (file: FileEntry) => {
  const downloadUrl = selectedLocation!.type === 's3'
    ? `${config.backend_api_url}/objects/${locationId}/${btoa(file.path)}?download=true`
    : `${config.backend_api_url}/local/download/${locationId}/${btoa(file.path)}`;

  // Use hidden link to avoid page navigation
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// In table
<Button variant="link" onClick={() => handleDownload(file)}>
  Download
</Button>
```

3. Update file deletion to use `storageService`:

```typescript
// BEFORE
await Promise.all(
  Array.from(selectedItems).map((path) =>
    axios.delete(`${config.backend_api_url}/objects/${bucketName}/${path}`),
  ),
);

// AFTER
await Promise.all(
  Array.from(selectedItems).map((path) => storageService.deleteFile(locationId!, path)),
);
```

4. Update directory creation to use `storageService`:

```typescript
// BEFORE
await axios.post(`${config.backend_api_url}/objects/${bucketName}/${path}/`);

// AFTER
await storageService.createDirectory(locationId!, path);
```

### Step 4.1: Verify Upload Progress Support

**Estimated Time**: 15 minutes

**Action Items**:

1. Check if `storageService.uploadFile()` (line 187-210 in storageService.ts) supports progress callbacks
2. If not, update signature:

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
    if (location.type === 's3') {
      await axios.post(
        `${config.backend_api_url}/objects/${locationId}/${path}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: options?.onProgress
            ? (progressEvent) => {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
                );
                options.onProgress!(percentCompleted);
              }
            : undefined,
        }
      );
    } else {
      await axios.post(
        `${config.backend_api_url}/local/files/${locationId}/${path}`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: options?.onProgress
            ? (progressEvent) => {
                const percentCompleted = Math.round(
                  (progressEvent.loaded * 100) / (progressEvent.total || progressEvent.loaded)
                );
                options.onProgress!(percentCompleted);
              }
            : undefined,
        }
      );
    }
  } catch (error) {
    console.error(`Failed to upload file to ${locationId}/${path}:`, error);
    throw error;
  }
}
```

### Step 5: Update Navigation and Breadcrumbs

**Estimated Time**: 1 hour

**Changes Required**:

1. Update breadcrumb links:

```typescript
// BEFORE
<BreadcrumbItem to={`/objects/${bucketName}`}>
  <Button onClick={handlePrefixClick('')}>
    {bucketName}
  </Button>
</BreadcrumbItem>

// AFTER
<BreadcrumbItem to={`/browse/${locationId}`}>
  <Button onClick={handlePathClick('')}>
    {selectedLocation?.name || locationId}
  </Button>
</BreadcrumbItem>
```

2. Update path click handler (renamed from `handlePrefixClick`):

```typescript
// BEFORE
const handlePrefixClick =
  (plainTextPrefix: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    setS3Objects(null);
    setS3Prefixes(null);
    setDecodedPrefix(plainTextPrefix);
    setNextContinuationToken(null);
    setIsTruncated(false);
    setSearchObjectText('');
    navigate(
      plainTextPrefix !== ''
        ? `/objects/${bucketName}/${btoa(plainTextPrefix)}`
        : `/objects/${bucketName}`,
    );
  };

// AFTER
const handlePathClick = (newPath: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
  event.preventDefault();
  setFiles([]);
  setDirectories([]);
  setCurrentPath(newPath);
  setPaginationToken(null);
  setPaginationOffset(0);
  setIsTruncated(false);
  setSearchObjectText('');
  navigate(newPath !== '' ? `/browse/${locationId}/${btoa(newPath)}` : `/browse/${locationId}`);
};
```

3. Update breadcrumb path splitting:

```typescript
// Split current path for breadcrumbs
const pathParts = currentPath.split('/').filter(Boolean);

// Render breadcrumbs
<Breadcrumb>
  <BreadcrumbItem to={`/browse/${locationId}`}>
    <Button variant="link" onClick={handlePathClick('')}>
      {selectedLocation?.name || locationId}
    </Button>
  </BreadcrumbItem>

  {pathParts.map((part, index) => {
    const pathUpToHere = pathParts.slice(0, index + 1).join('/');
    return (
      <BreadcrumbItem key={pathUpToHere}>
        <Button variant="link" onClick={handlePathClick(pathUpToHere)}>
          {part}
        </Button>
      </BreadcrumbItem>
    );
  })}
</Breadcrumb>
```

### Step 5.1: Verify Breadcrumb Path Splitting

**Estimated Time**: 15 minutes

**Action Items**:

1. Test breadcrumb rendering with:

   - S3 paths: `folder1/folder2/file.txt`
   - Local paths: `folder1/folder2/file.txt`
   - Edge cases: Empty path, single folder, trailing slash

2. Verify path encoding/decoding works correctly:
   - URL uses base64-encoded paths
   - Display shows decoded paths
   - Navigation preserves special characters

### Step 6: Update Pagination Controls

**Estimated Time**: 30 minutes

**Changes Required**:

1. Update "Load More" button to work with both pagination styles:

```typescript
const handleLoadMore = () => {
  if (!isTruncated || isLoadingMore || deepSearchActive || !selectedLocation) return;
  setIsLoadingMore(true);

  if (selectedLocation.type === 's3') {
    // Use continuation token for S3
    refreshFiles(
      selectedLocation,
      currentPath,
      paginationToken!,
      true,
      serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
      abortControllerRef.current || undefined,
    ).finally(() => setIsLoadingMore(false));
  } else {
    // Use offset for local storage
    refreshFiles(
      selectedLocation,
      currentPath,
      undefined,
      true,
      undefined,
      abortControllerRef.current || undefined,
    ).finally(() => setIsLoadingMore(false));
  }
};
```

2. Update pagination display text:

```typescript
// BEFORE
<Text>
  Showing {s3Objects?.s3Objects.length || 0} objects
  {isTruncated && ' (more available)'}
</Text>

// AFTER
<Text>
  Showing {files.length} file(s) and {directories.length} folder(s)
  {isTruncated && ' (more available)'}
</Text>
```

### Step 7: Update UI Labels and Titles

**Estimated Time**: 15 minutes

**Changes Required**:

1. Update page title:

```typescript
// BEFORE
<Content component={ContentVariants.h1}>S3 Objects Browser</Content>

// AFTER
<Content component={ContentVariants.h1}>
  {selectedLocation ? `${selectedLocation.name} Browser` : 'Storage Browser'}
</Content>
```

2. Update location selector labels:

```typescript
// BEFORE
<Content component={ContentVariants.p}>Bucket Selection:</Content>

// AFTER
<Content component={ContentVariants.p}>Storage Location:</Content>
```

3. Update location override input:

```typescript
// BEFORE
<Content component={ContentVariants.p}>Bucket override:</Content>

// AFTER
<Content component={ContentVariants.p}>Location override:</Content>
```

4. Update toolbar labels:

```typescript
// Update "Create Folder" to "Create Directory" for consistency
// Update "Upload to S3" to "Upload Files"
// Update search placeholder from "Search S3 objects" to "Search files"
```

### Step 8: Update HuggingFace Model Import

**Estimated Time**: 45 minutes

**Changes Required**:

1. Verify HuggingFace import modal uses unified locations:

```typescript
// Check if modal loads locations via storageService or separate bucket call
// Lines 1088-1090 in ObjectBrowser

// If it already uses storageService.getLocations(), verify:
const localLocations = locations.filter((loc) => loc.type === 'local' && loc.available);
const s3Locations = locations.filter((loc) => loc.type === 's3' && loc.available);
```

2. Update destination selection UI:

```typescript
// S3 destinations
<FormSelectOption
  key="s3-header"
  value=""
  label="S3 Buckets"
  isDisabled
/>
{s3Locations.map((location) => (
  <FormSelectOption
    key={location.id}
    value={location.id}
    label={location.name}
  />
))}

// Local destinations
{localLocations.length > 0 && (
  <>
    <FormSelectOption
      key="local-header"
      value=""
      label="Local Storage"
      isDisabled
    />
    {localLocations.map((location) => (
      <FormSelectOption
        key={location.id}
        value={location.id}
        label={location.name}
        isDisabled={!location.available}
      />
    ))}
  </>
)}
```

3. Verify import uses correct destination based on `destType` state (already implemented).

### Step 9: Update Transfer Modal Integration

**Estimated Time**: 15 minutes

**Changes Required**:

The Transfer modal needs to detect source storage type from selected location:

```typescript
// BEFORE
<TransferAction
  sourceLocationId={bucketName!}
  sourceType="s3"
  sourcePath={decodedPrefix}
  selectedFiles={Array.from(selectedItems)}
/>

// AFTER
<TransferAction
  sourceLocationId={locationId!}
  sourceType={selectedLocation?.type || 's3'}
  sourcePath={currentPath}
  selectedFiles={Array.from(selectedItems)}
/>
```

### Step 10: Test Unavailable Location Handling

**Estimated Time**: 30 minutes

**Action Items**:

1. Test UI behavior when location is unavailable:

   - Dropdown shows location as disabled
   - Selecting unavailable location shows warning notification
   - Breadcrumb shows location name but browsing is disabled
   - Upload/delete/create operations show appropriate error

2. Test direct navigation to unavailable location:

   - URL: `/browse/local-1/some/path` where `local-1` is unavailable
   - Should show warning and redirect to location selector or first available

3. Add visual indicator for unavailable location:

```typescript
{!selectedLocation?.available && (
  <Alert
    variant="warning"
    title="Location Unavailable"
    isInline
  >
    The selected storage location is currently unavailable. Files cannot be accessed.
  </Alert>
)}
```

### Step 11: Handle Symlinks Display (If Applicable)

**Estimated Time**: 15 minutes

**Action Items**:

1. Check if local storage backend returns symlinks (FileEntry has `type: 'symlink'` and `target`)

2. If yes, add symlink rendering:

```typescript
// In file/directory rendering
{file.type === 'symlink' && (
  <Tooltip content={`Link to: ${file.target}`}>
    <Label color="blue" icon={<LinkIcon />}>Symlink</Label>
  </Tooltip>
)}
```

3. Decide symlink behavior:
   - Should clicking a symlink directory navigate to target?
   - Should downloading a symlink file download the target?
   - Security consideration: Prevent symlink traversal outside storage location

## Testing Plan

### Unit Testing

1. **Location loading and selection**

   - Test `getLocations()` returns both S3 and local locations
   - Test location selection updates state correctly
   - Test unavailable location handling

2. **File listing with both storage types**

   - Test S3 listing with continuation token pagination
   - Test local listing with offset pagination
   - Test FileEntry mapping for both types

3. **Pagination**

   - Test S3 "Load More" uses continuation token correctly
   - Test local "Load More" uses offset correctly
   - Test pagination state reset on path change

4. **File operations**

   - Test upload works for both S3 and local
   - Test upload progress tracking
   - Test download URL generation for both types
   - Test delete works for both types
   - Test directory creation works for both types

5. **Navigation and URL handling**
   - Test path parameter extraction and decoding
   - Test navigation updates URL correctly
   - Test breadcrumb generation from path
   - Test invalid locationId handling

### Integration Testing

1. **Browse S3 bucket with pagination**

   - Select S3 location from dropdown
   - Navigate through folders
   - Load more results
   - Verify continuation token pagination

2. **Browse local storage location with pagination**

   - Select local location from dropdown
   - Navigate through directories
   - Load more results
   - Verify offset pagination

3. **Switch between S3 and local storage locations**

   - Browse S3 bucket, switch to local location
   - Verify state is reset correctly
   - Verify pagination state is separate

4. **Upload files to both storage types**

   - Upload to S3 bucket
   - Upload to local storage
   - Verify progress tracking works

5. **Download files from both storage types**

   - Download from S3 bucket
   - Download from local storage
   - Verify correct URL format

6. **Delete files from both storage types**

   - Delete single file from S3
   - Delete multiple files from S3
   - Delete single file from local storage
   - Delete multiple files from local storage

7. **Create directories in both storage types**

   - Create directory in S3 bucket (marker object)
   - Create directory in local storage

8. **Search/filter files in both storage types**

   - Test client-side search
   - Test server-side search (verify backend support for local)

9. **Transfer files between S3 and local storage**
   - Initiate transfer from S3 to local
   - Initiate transfer from local to S3
   - Verify source type detection

### UI/UX Testing

1. **Location selector shows both S3 and local locations**

   - Verify dropdown shows all locations
   - Verify location type indicator (S3/LOCAL)
   - Verify disabled state for unavailable locations

2. **Disabled state for unavailable local locations**

   - Verify visual indicator
   - Verify selection is prevented
   - Verify tooltip/help text

3. **Breadcrumbs show correct location name**

   - Verify location name appears (not just ID)
   - Verify path segments are clickable
   - Verify root breadcrumb returns to location root

4. **Page title updates based on selected location**

   - Verify title shows location name
   - Verify title shows "Storage Browser" when no location

5. **"Load More" button works for both pagination styles**

   - Verify button appears when more results available
   - Verify button disabled during loading
   - Verify loading indicator

6. **Error messages are appropriate for each storage type**
   - S3 errors show S3-specific messages
   - Local errors show filesystem-specific messages
   - Generic fallback for unknown errors

## Success Criteria

### Functional Requirements

- [ ] User can select both S3 buckets and local PVC locations from dropdown
- [ ] Location dropdown shows storage type indicator (S3/LOCAL)
- [ ] Unavailable locations are disabled and show appropriate feedback
- [ ] File listing works correctly for both storage types
- [ ] Pagination works correctly with appropriate style for each storage type (S3: continuationToken, Local: offset)
- [ ] All file operations work for both types:
  - [ ] Upload files
  - [ ] Download files
  - [ ] Delete files
  - [ ] Create directories
- [ ] Navigation and breadcrumbs work correctly for both types
- [ ] Search/filter works for both storage types (verify backend support)
- [ ] Transfer modal can initiate transfers from both storage types

### Technical Requirements

- [ ] No S3-specific functions called for local storage operations
- [ ] Uses `storageService` for all storage operations
- [ ] Properly handles different pagination metadata (S3: continuationToken, Local: offset)
- [ ] State uses FileEntry interface directly (no S3-style mapping)
- [ ] State variables use storage-agnostic names (files, directories, paginationToken)
- [ ] No hardcoded storage type assumptions in code
- [ ] All navigation uses new `/browse/:locationId/:path?` pattern
- [ ] Upload progress tracking works for both storage types
- [ ] Download doesn't cause page navigation issues
- [ ] formatBytes() called at render time (numeric values in state)
- [ ] Proper error handling for unavailable/missing locations

### UI/UX Requirements

- [ ] Labels are storage-agnostic (not "S3 Objects Browser")
- [ ] Page title shows location name
- [ ] Location selector clearly indicates storage type
- [ ] Unavailable locations are disabled with appropriate visual feedback
- [ ] Breadcrumbs show location name, not just ID
- [ ] Breadcrumb path splitting works correctly
- [ ] Error messages are appropriate for each storage type
- [ ] Loading states are clear and consistent
- [ ] FileEntry data renders correctly in table (name, path, size, modified)

## Rollback Plan

If integration causes issues:

1. Keep `storageService.ts` changes (they're backwards compatible)
2. Revert ObjectBrowser changes
3. Revert `routes.tsx` changes
4. Add feature flag to enable/disable unified storage browsing
5. Optionally: Keep new `/browse/*` routes alongside old `/objects/*` routes temporarily

## Related Files

### Primary Files to Modify

- `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - Main component (majority of changes)
- `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts` - May need updates or deprecation
- `frontend/src/app/components/ObjectBrowser/objectBrowserTypes.ts` - Add FileEntry import
- `frontend/src/app/routes.tsx` - Route definitions
- `frontend/src/app/services/storageService.ts` - Add upload progress callback support

### Files to Reference

- `frontend/src/app/types/storage.ts` - StorageLocation and FileEntry interfaces (if separate file)
- `backend/src/routes/api/local/index.ts` - Local storage API (verify search support)
- `backend/src/routes/api/objects/index.ts` - S3 API

### Documentation

- `docs/features/pvc-storage-support.md` - Feature specification
- `docs/architecture/frontend-architecture.md` - Frontend patterns

## Notes

### Design Decisions Rationale

1. **Simplified URL pattern**: Deriving storage type from location lookup provides single source of truth and eliminates validation concerns.

2. **Renamed state variables**: Using storage-agnostic names (files, directories) makes code more maintainable and less confusing when working with local storage.

3. **Direct FileEntry usage**: Storing FileEntry objects directly in state provides better abstraction and avoids unnecessary data transformation.

4. **No URL migration**: Breaking old URLs simplifies implementation. Users will need to re-navigate, but this is acceptable for a tool in active development.

5. **Upload progress in storageService**: Keeping upload logic centralized in storageService maintains clean separation of concerns.

6. **Download via createElement**: Using hidden anchor element avoids page navigation issues with window.location.href.

### Implementation Order

Recommended implementation order:

1. Step 0 (routes)
2. Step 1 (URL params)
3. Step 2 (location loading)
4. Step 3 + 3.1 (state refactor + table rendering)
5. Step 4 + 4.1 (file operations)
6. Step 5 + 5.1 (navigation)
7. Step 6 (pagination)
8. Step 7 (UI labels)
9. Step 8 (HF import)
10. Step 9 (transfer modal)
11. Step 10 (error handling)
12. Step 11 (symlinks if needed)

### Risk Areas

- **Upload progress**: Needs verification/implementation in storageService
- **Search on local storage**: Backend support needs verification
- **Symlink handling**: Security and UX considerations
- **Table rendering changes**: Many small updates needed for FileEntry interface

### Post-Implementation Verification

After implementation, verify:

1. No TypeScript errors
2. All tests passing
3. Manual testing of all success criteria
4. No console errors during normal operation
5. Memory usage reasonable during pagination
6. Upload progress updates smoothly
7. Download works without page navigation
