# ObjectBrowser Unified Storage Integration Plan

## Overview

This document outlines the plan to refactor the `ObjectBrowser` component to work with both S3 buckets and local PVC storage, using the unified `StorageService` interface.

**Status**: Planning Phase
**Target Completion**: Phase 2 of PVC Storage Support Feature
**Estimated Effort**: ~6 hours

## Problem Statement

The `ObjectBrowser` component (`frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx`) is currently hardcoded to work only with S3 buckets. Even though:

1. ✅ Backend correctly supports both S3 and local storage with appropriate pagination
2. ✅ `StorageService` has been updated to support both pagination styles
3. ❌ ObjectBrowser still uses S3-specific functions and UI

**Success Criteria**: Users can browse, upload, download, and delete files in both S3 buckets and local PVC storage through the same unified UI.

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

## Implementation Plan

### Step 1: Update URL Routing and Parameters

**Estimated Time**: 30 minutes

**Current Route Pattern**:

```
/objects/:bucketName/:prefix?
```

**New Route Pattern**:

```
/browse/:storageType/:locationId/:path?
```

**Changes Required**:

1. Update `routes.tsx` to use new pattern
2. Update URL parameter extraction in ObjectBrowser:

```typescript
// BEFORE
const { bucketName } = useParams<{ bucketName: string }>();
const { prefix } = useParams<{ prefix: string }>();

// AFTER
const { storageType, locationId, path } = useParams<{
  storageType: 's3' | 'local';
  locationId: string;
  path?: string;
}>();
```

3. Update all `navigate()` calls to use new pattern:

```typescript
// BEFORE
navigate(`/objects/${bucketName}/${btoa(prefix)}`);

// AFTER
navigate(`/browse/${storageType}/${locationId}/${btoa(path)}`);
```

### Step 2: Replace Bucket Loading with Location Loading

**Estimated Time**: 45 minutes

**Changes Required**:

1. Replace bucket loading with storage locations:

```typescript
// BEFORE
const [bucketsList, setBucketsList] = React.useState<BucketsList | null>(null);
const [formSelectBucket, setFormSelectBucket] = React.useState(bucketName);

// Load buckets
React.useEffect(() => {
  if (bucketName) {
    loadBuckets(bucketName, navigate, (updatedBucketsList) => {
      setBucketsList(updatedBucketsList);
      // ...
    });
  }
}, [location]);

// AFTER
const [locations, setLocations] = React.useState<StorageLocation[]>([]);
const [selectedLocation, setSelectedLocation] = React.useState<StorageLocation | null>(null);

// Load all storage locations
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

// Set selected location from URL parameters
React.useEffect(() => {
  if (locationId && locations.length > 0) {
    const location = locations.find((loc) => loc.id === locationId);
    setSelectedLocation(location || null);
  }
}, [locationId, locations]);
```

2. Update location selector dropdown:

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
  value={locationId}
  onChange={handleLocationSelectorChange}
>
  {locations.map((loc) => (
    <FormSelectOption
      key={loc.id}
      value={loc.id}
      label={`${loc.name} (${loc.type})`}
      isDisabled={!loc.available}
    />
  ))}
</FormSelect>
```

### Step 3: Create Unified File Listing Function

**Estimated Time**: 1.5 hours

**Changes Required**:

1. Create new unified listing function to replace `refreshObjects()`:

```typescript
const refreshFiles = async (
  location: StorageLocation,
  path: string,
  continuationToken?: string,
  appendResults: boolean = false,
  searchParams?: { q: string; mode: 'startsWith' | 'contains' },
  abortController?: AbortController,
) => {
  try {
    let response;

    if (location.type === 's3') {
      // Use S3 pagination
      response = await storageService.listFiles(location.id, path, {
        continuationToken,
        maxKeys: searchParams ? undefined : 1000,
      });

      // Update S3-specific pagination state
      setNextContinuationToken(response.nextContinuationToken || null);
      setIsTruncated(response.isTruncated || false);
    } else {
      // Use local storage pagination
      const offset = appendResults ? s3Objects?.length || 0 : 0;
      response = await storageService.listFiles(location.id, path, {
        limit: 1000,
        offset,
      });

      // For local storage, check if more results available
      const hasMore = response.totalCount! > offset + response.files.length;
      setIsTruncated(hasMore);
      setLocalOffset(offset + response.files.length);
    }

    // Separate files and directories
    const directories = response.files.filter((f) => f.type === 'directory');
    const files = response.files.filter((f) => f.type === 'file');

    if (appendResults) {
      setS3Prefixes((prev) => ({
        s3Prefixes: [...(prev?.s3Prefixes || []), ...directories.map((d) => ({ Prefix: d.path }))],
      }));
      setS3Objects((prev) => ({
        s3Objects: [
          ...(prev?.s3Objects || []),
          ...files.map((f) => ({
            Key: f.path,
            LastModified: f.modified?.toISOString() || '',
            Size: formatBytes(f.size || 0),
            OriginalSize: f.size || 0,
          })),
        ],
      }));
    } else {
      setS3Prefixes({
        s3Prefixes: directories.map((d) => ({ Prefix: d.path })),
      });
      setS3Objects({
        s3Objects: files.map((f) => ({
          Key: f.path,
          LastModified: f.modified?.toISOString() || '',
          Size: formatBytes(f.size || 0),
          OriginalSize: f.size || 0,
        })),
      });
    }

    setDecodedPrefix(path);
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

2. Add local storage pagination state:

```typescript
const [localOffset, setLocalOffset] = React.useState(0);
```

3. Update all calls to `refreshObjects()` to use `refreshFiles()` instead

### Step 4: Update File Operations

**Estimated Time**: 2 hours

**Changes Required**:

1. Update file upload to use `storageService`:

```typescript
// BEFORE
axios.post(`${config.backend_api_url}/objects/upload/${bucketName}/${btoa(fullPath)}`, formData, {
  /* ... */
});

// AFTER
await storageService.uploadFile(locationId, fullPath, file);
```

2. Update file download to use `storageService`:

```typescript
// BEFORE
href={`${config.backend_api_url}/objects/download/${bucketName}/${btoa(row.key)}`}

// AFTER
onClick={() => storageService.downloadFile(locationId, row.key)}
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
  Array.from(selectedItems).map((path) => storageService.deleteFile(locationId, path)),
);
```

4. Update directory creation to use `storageService`:

```typescript
// BEFORE
await axios.post(`${config.backend_api_url}/objects/${bucketName}/${path}/`);

// AFTER
await storageService.createDirectory(locationId, path);
```

### Step 5: Update Navigation and Breadcrumbs

**Estimated Time**: 45 minutes

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
<BreadcrumbItem to={`/browse/${storageType}/${locationId}`}>
  <Button onClick={handlePathClick('')}>
    {selectedLocation?.name || locationId}
  </Button>
</BreadcrumbItem>
```

2. Update prefix/path click handler:

```typescript
// BEFORE
const handlePrefixClick =
  (plainTextPrefix: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    // ...
    navigate(
      plainTextPrefix !== ''
        ? `/objects/${bucketName}/${btoa(plainTextPrefix)}`
        : `/objects/${bucketName}`,
    );
  };

// AFTER
const handlePathClick = (newPath: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
  setS3Objects(null);
  setS3Prefixes(null);
  setDecodedPrefix(newPath);
  setNextContinuationToken(null);
  setIsTruncated(false);
  setLocalOffset(0);
  setSearchObjectText('');
  navigate(
    newPath !== ''
      ? `/browse/${storageType}/${locationId}/${btoa(newPath)}`
      : `/browse/${storageType}/${locationId}`,
  );
};
```

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
      path || '',
      nextContinuationToken!,
      true,
      serverSearchActive ? { q: searchObjectText, mode: searchMode } : undefined,
      abortControllerRef.current || undefined,
    )
      .then(() => setIsLoadingMore(false))
      .catch(() => setIsLoadingMore(false));
  } else {
    // Use offset for local storage
    refreshFiles(
      selectedLocation,
      path || '',
      undefined,
      true,
      undefined,
      abortControllerRef.current || undefined,
    )
      .then(() => setIsLoadingMore(false))
      .catch(() => setIsLoadingMore(false));
  }
};
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

### Step 8: Update HuggingFace Model Import

**Estimated Time**: 30 minutes

**Changes Required**:

The HuggingFace import modal already supports both S3 and local destinations (lines 1088-1090), but needs to work with the new location system:

1. Update destination selection to use unified locations:

```typescript
// Already correct - uses locations from storageService
const localLocations = locations.filter((loc) => loc.type === 'local' && loc.available);

// S3 buckets
{locations
  .filter((loc) => loc.type === 's3')
  .map((bucket) => (
    <FormSelectOption key={bucket.id} value={bucket.id} label={bucket.name} />
  ))}
```

2. No changes needed - already uses `destType` and separate fields for S3/local

### Step 9: Update Transfer Modal Integration

**Estimated Time**: 15 minutes

**Changes Required**:

The Transfer modal (lines 2051-2064) needs to detect source storage type:

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
  sourcePath={path || ''}
  selectedFiles={Array.from(selectedItems)}
/>
```

## Testing Plan

### Unit Testing

1. Test location loading and selection
2. Test file listing with both storage types
3. Test pagination with both S3 (continuation token) and local (offset) styles
4. Test file operations (upload, download, delete) for both storage types
5. Test navigation and URL parameter handling

### Integration Testing

1. Browse S3 bucket with pagination
2. Browse local storage location with pagination
3. Switch between S3 and local storage locations
4. Upload files to both storage types
5. Download files from both storage types
6. Delete files from both storage types
7. Create directories in both storage types
8. Search/filter files in both storage types
9. Transfer files between S3 and local storage

### UI/UX Testing

1. Verify location selector shows both S3 and local locations
2. Verify disabled state for unavailable local locations
3. Verify breadcrumbs show correct location name
4. Verify page title updates based on selected location
5. Verify "Load More" button works for both pagination styles

## Success Criteria

✅ **Functional Requirements**:

- [ ] User can select both S3 buckets and local PVC locations from dropdown
- [ ] File listing works correctly for both storage types
- [ ] Pagination works correctly with appropriate style for each storage type
- [ ] All file operations (upload, download, delete, create directory) work for both types
- [ ] Navigation and breadcrumbs work correctly for both types
- [ ] Search/filter works for both storage types
- [ ] Transfer modal can initiate transfers from both storage types

✅ **Technical Requirements**:

- [ ] No S3-specific functions called for local storage operations
- [ ] Uses `storageService` for all storage operations
- [ ] Properly handles different pagination metadata (S3: continuationToken, Local: offset)
- [ ] No hardcoded storage type assumptions in code
- [ ] All navigation uses new `/browse/:storageType/:locationId/:path?` pattern

✅ **UI/UX Requirements**:

- [ ] Labels are storage-agnostic (not "S3 Objects Browser")
- [ ] Location selector clearly indicates storage type
- [ ] Unavailable locations are disabled with appropriate visual feedback
- [ ] Breadcrumbs show location name, not just ID
- [ ] Error messages are appropriate for each storage type

## Rollback Plan

If integration causes issues:

1. Keep `storageService.ts` changes (they're backwards compatible)
2. Revert ObjectBrowser changes
3. Keep old routes alongside new routes temporarily
4. Add feature flag to enable/disable unified storage browsing

## Related Files

- `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx` - Main component
- `frontend/src/app/services/storageService.ts` - Unified storage service
- `frontend/src/app/routes.tsx` - Route definitions
- `backend/src/routes/api/local/index.ts` - Local storage API
- `backend/src/routes/api/objects/index.ts` - S3 API
- `docs/features/pvc-storage-support.md` - Feature specification

## Notes

- This plan maintains backwards compatibility by keeping S3-specific state variable names (`s3Objects`, `s3Prefixes`) even though they now hold data from both storage types
- The `refreshFiles()` function normalizes data from both storage types into a common format
- Pagination controls automatically adapt based on storage type
- Transfer functionality already supports both storage types at the API level
