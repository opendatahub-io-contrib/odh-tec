# Phase 1.6: HuggingFace Integration for Local Storage

> **Task ID**: phase-1.6
> **Estimated Effort**: 1 day
> **Dependencies**: Phase 1.1 (Transfer Queue), Phase 1.3 (Local Storage Utils)

## Objective

Extend existing HuggingFace import route to support downloading models to local PVC storage in addition to S3 buckets.

## Files to Modify

- `backend/src/routes/api/objects/index.ts` - Modify `/huggingface-import` route (around line 372)

## Implementation Steps

### Step 1: Update Request Schema

Modify the HuggingFace import route to accept new parameters:

```typescript
interface HuggingFaceImportRequest {
  // New parameters
  destinationType: 's3' | 'local';
  localLocationId?: string; // required if destinationType === 'local'
  localPath?: string; // destination directory path

  // Existing parameters
  bucketName?: string; // required if destinationType === 's3'
  modelId: string;
  hfToken?: string;
  prefix?: string;
}
```

### Step 2: Add Validation

```typescript
app.post<{ Body: HuggingFaceImportRequest }>(
  '/api/objects/huggingface-import',
  async (request, reply) => {
    const { destinationType, localLocationId, localPath, bucketName, modelId, hfToken, prefix } =
      request.body;

    // Validate destination parameters
    if (destinationType === 's3' && !bucketName) {
      return reply.code(400).send({ error: 'bucketName required for S3 destination' });
    }
    if (destinationType === 'local' && (!localLocationId || !localPath)) {
      return reply
        .code(400)
        .send({ error: 'localLocationId and localPath required for local destination' });
    }

    // Validate local path if local destination
    if (destinationType === 'local') {
      try {
        await validatePath(localLocationId!, localPath!);
      } catch (error) {
        return reply.code(400).send({ error: 'Invalid local storage path' });
      }
    }

    // Continue with existing implementation...
  },
);
```

### Step 3: Modify Download Logic

Update the file download loop to support both S3 and local destinations:

```typescript
// Queue transfer job
const files = modelFiles.map((file) => ({
  sourcePath: file.url,
  destinationPath:
    destinationType === 's3'
      ? `s3:${bucketName}/${prefix || ''}${file.path}`
      : `local:${localLocationId}/${localPath}/${file.path}`,
  size: file.size || 0,
}));

const jobId = transferQueue.queueJob('huggingface', files, async (fileJob, onProgress) => {
  await downloadHuggingFaceFile(fileJob, destinationType, hfToken, onProgress);
});

// Return SSE URL for progress
return {
  jobId,
  sseUrl: `/api/transfer/progress/${jobId}`,
};
```

### Step 4: Implement Download Function

```typescript
async function downloadHuggingFaceFile(
  fileJob: TransferFileJob,
  destinationType: 's3' | 'local',
  hfToken: string | undefined,
  onProgress: (loaded: number) => void,
) {
  const { sourcePath, destinationPath, size } = fileJob;

  // Parse destination
  const [destType, destLoc, destPath] = destinationPath.split(':');

  // Fetch from HuggingFace
  const headers: Record<string, string> = {};
  if (hfToken) {
    headers['Authorization'] = `Bearer ${hfToken}`;
  }

  const response = await fetch(sourcePath, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }

  const stream = response.body;
  if (!stream) {
    throw new Error('No response body');
  }

  // Track progress
  let loaded = 0;
  const progressTransform = new Transform({
    transform(chunk, encoding, callback) {
      loaded += chunk.length;
      onProgress(loaded);
      callback(null, chunk);
    },
  });

  // Write to destination
  if (destinationType === 's3') {
    // Upload to S3
    const [bucket, key] = destLoc.split('/');
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: destPath,
        Body: stream.pipe(progressTransform),
      },
    });
    await upload.done();
  } else {
    // Write to local storage
    const absolutePath = await validatePath(destLoc, destPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    // Stream to file
    await pipeline(stream, progressTransform, fs.createWriteStream(absolutePath));
  }
}
```

### Step 5: Maintain SSE Pattern

Ensure the SSE pattern remains consistent:

```typescript
// Client connects to SSE endpoint
const eventSource = new EventSource(`/api/transfer/progress/${jobId}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`File: ${data.file}, Progress: ${data.loaded}/${data.total}`);
};
```

## Acceptance Criteria

- [ ] Route accepts `destinationType` parameter ('s3' or 'local')
- [ ] S3 destination requires `bucketName`
- [ ] Local destination requires `localLocationId` and `localPath`
- [ ] Path validation applied for local destinations
- [ ] HuggingFace files download to correct destination
- [ ] Progress updates via SSE work for both destination types
- [ ] Shared transfer queue used for concurrency control
- [ ] File size limits enforced
- [ ] Error handling provides clear messages
- [ ] Existing S3 functionality not broken (backward compatible)
- [ ] Unit tests cover both destination types
- [ ] Integration tests verify end-to-end flow

## Testing Requirements

Test scenarios:

1. Download model to S3 bucket (existing functionality)
2. Download model to local storage
3. Invalid local path rejection
4. File size limit enforcement
5. Progress updates via SSE
6. Concurrent downloads respecting limits

## Backward Compatibility

Ensure existing S3-only clients continue to work:

- Default `destinationType` to 's3' if not provided (optional)
- Or require explicit `destinationType` (recommended)

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 368-399)
- Existing route: `backend/src/routes/api/objects/index.ts:372`
- HuggingFace Hub API: https://huggingface.co/docs/hub/api
