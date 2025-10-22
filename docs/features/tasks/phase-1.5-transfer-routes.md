# Phase 1.5: Cross-Storage Transfer Routes

> **Task ID**: phase-1.5
> **Estimated Effort**: 2-2.5 days
> **Dependencies**: Phase 1.1 (Transfer Queue), Phase 1.3 (Local Storage), Phase 1.4 (Local Storage Routes)

## Objective

Implement cross-storage transfer API routes with Server-Sent Events (SSE) for real-time progress updates. Support all transfer combinations: S3↔Local, Local↔Local, S3↔S3.

## Files to Create

- `backend/src/routes/api/transfer/index.ts` - Transfer routes plugin
- `backend/src/__tests__/routes/api/transfer/index.test.ts` - Route tests

## Key Routes

### POST /api/transfer

```typescript
// Initiate cross-storage transfer
app.post<{
  Body: {
    source: { type: 'local' | 's3'; locationId: string; path: string };
    destination: { type: 'local' | 's3'; locationId: string; path: string };
    files: string[];
    conflictResolution: 'overwrite' | 'skip' | 'rename';
  };
}>('/api/transfer', async (request, reply) => {
  const { source, destination, files, conflictResolution } = request.body;

  try {
    // Create transfer job
    const jobId = transferQueue.queueJob(
      'cross-storage',
      files.map((file) => ({
        sourcePath: `${source.type}:${source.locationId}/${file}`,
        destinationPath: `${destination.type}:${destination.locationId}/${file}`,
        size: 0, // Will be determined during transfer
      })),
      async (fileJob, onProgress) => {
        await executeTransfer(fileJob, source, destination, conflictResolution, onProgress);
      },
    );

    return {
      jobId,
      sseUrl: `/api/transfer/progress/${jobId}`,
    };
  } catch (error) {
    return handleError(error, reply);
  }
});
```

### GET /api/transfer/progress/:jobId

```typescript
// SSE endpoint for real-time progress
app.get<{ Params: { jobId: string } }>('/api/transfer/progress/:jobId', async (request, reply) => {
  const { jobId } = request.params;

  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const sendEvent = (data: any) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial job state
  const job = transferQueue.getJob(jobId);
  if (!job) {
    sendEvent({ error: 'Job not found' });
    reply.raw.end();
    return;
  }

  // Listen for job updates
  const updateListener = (updatedJob: TransferJob) => {
    if (updatedJob.id === jobId) {
      updatedJob.files.forEach((file) => {
        sendEvent({
          file: file.destinationPath,
          loaded: file.loaded,
          total: file.size,
          status: file.status,
          error: file.error,
        });
      });

      // Close stream when job complete
      if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
        transferQueue.off('job-updated', updateListener);
        reply.raw.end();
      }
    }
  };

  transferQueue.on('job-updated', updateListener);

  // Clean up on connection close
  request.raw.on('close', () => {
    transferQueue.off('job-updated', updateListener);
  });
});
```

### DELETE /api/transfer/:jobId

```typescript
// Cancel transfer
app.delete<{ Params: { jobId: string } }>('/api/transfer/:jobId', async (request, reply) => {
  const { jobId } = request.params;
  const cancelled = transferQueue.cancelJob(jobId);

  return { cancelled };
});
```

### POST /api/transfer/check-conflicts

```typescript
// Pre-flight conflict check
app.post<{
  Body: {
    destination: { type: 'local' | 's3'; locationId: string; path: string };
    files: string[];
  };
}>('/api/transfer/check-conflicts', async (request, reply) => {
  const { destination, files } = request.body;
  const conflicts: string[] = [];

  for (const file of files) {
    const destPath = path.join(destination.path, file);

    try {
      if (destination.type === 'local') {
        const absolutePath = await validatePath(destination.locationId, destPath);
        await fs.access(absolutePath);
        conflicts.push(file);
      } else {
        // S3 conflict check
        const exists = await checkS3ObjectExists(destination.locationId, destPath);
        if (exists) conflicts.push(file);
      }
    } catch {
      // File doesn't exist, no conflict
    }
  }

  return { conflicts };
});
```

## Transfer Implementation

```typescript
async function executeTransfer(
  fileJob: TransferFileJob,
  source: any,
  destination: any,
  conflictResolution: string,
  onProgress: (loaded: number) => void,
) {
  // Parse source and destination
  const [sourceType, sourceLoc, sourcePath] = parseTransferPath(fileJob.sourcePath);
  const [destType, destLoc, destPath] = parseTransferPath(fileJob.destinationPath);

  // Handle conflict resolution
  let finalDestPath = destPath;
  if (conflictResolution === 'skip') {
    const exists = await checkExists(destType, destLoc, destPath);
    if (exists) return;
  } else if (conflictResolution === 'rename') {
    finalDestPath = await findNonConflictingName(destType, destLoc, destPath);
  }

  // Execute transfer based on source/destination types
  if (sourceType === 's3' && destType === 'local') {
    await transferS3ToLocal(sourceLoc, sourcePath, destLoc, finalDestPath, onProgress);
  } else if (sourceType === 'local' && destType === 's3') {
    await transferLocalToS3(sourceLoc, sourcePath, destLoc, finalDestPath, onProgress);
  } else if (sourceType === 'local' && destType === 'local') {
    await transferLocalToLocal(sourceLoc, sourcePath, destLoc, finalDestPath, onProgress);
  } else if (sourceType === 's3' && destType === 's3') {
    await transferS3ToS3(sourceLoc, sourcePath, destLoc, finalDestPath, onProgress);
  }
}
```

## Transfer Type Implementations

```typescript
// S3 → Local
async function transferS3ToLocal(
  bucket: string,
  key: string,
  locationId: string,
  destPath: string,
  onProgress: (loaded: number) => void,
) {
  const absolutePath = await validatePath(locationId, destPath);
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  let loaded = 0;
  await pipeline(
    response.Body,
    new Transform({
      transform(chunk, encoding, callback) {
        loaded += chunk.length;
        onProgress(loaded);
        callback(null, chunk);
      },
    }),
    fs.createWriteStream(absolutePath),
  );
}

// Local → S3
async function transferLocalToS3(
  locationId: string,
  sourcePath: string,
  bucket: string,
  key: string,
  onProgress: (loaded: number) => void,
) {
  const absolutePath = await validatePath(locationId, sourcePath);
  const fileStream = fs.createReadStream(absolutePath);
  const upload = new Upload({
    client: s3Client,
    params: { Bucket: bucket, Key: key, Body: fileStream },
  });

  upload.on('httpUploadProgress', (progress) => {
    onProgress(progress.loaded || 0);
  });

  await upload.done();
}

// Local → Local
async function transferLocalToLocal(
  sourceLoc: string,
  sourcePath: string,
  destLoc: string,
  destPath: string,
  onProgress: (loaded: number) => void,
) {
  const sourceAbsolute = await validatePath(sourceLoc, sourcePath);
  const destAbsolute = await validatePath(destLoc, destPath);

  let loaded = 0;
  await pipeline(
    fs.createReadStream(sourceAbsolute),
    new Transform({
      transform(chunk, encoding, callback) {
        loaded += chunk.length;
        onProgress(loaded);
        callback(null, chunk);
      },
    }),
    fs.createWriteStream(destAbsolute),
  );
}

// S3 → S3
async function transferS3ToS3(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
  onProgress: (loaded: number) => void,
) {
  const command = new CopyObjectCommand({
    Bucket: destBucket,
    Key: destKey,
    CopySource: `${sourceBucket}/${sourceKey}`,
  });

  await s3Client.send(command);
  onProgress(100); // S3 copy is atomic
}
```

## Acceptance Criteria

- [ ] POST /api/transfer creates job and returns job ID + SSE URL
- [ ] SSE endpoint streams real-time progress updates
- [ ] All four transfer types implemented (S3↔Local, Local↔Local, S3↔S3)
- [ ] Conflict resolution works (overwrite/skip/rename)
- [ ] Transfer cancellation works
- [ ] Pre-flight conflict check works
- [ ] Progress events include file, loaded, total, status
- [ ] SSE connection closes when transfer complete
- [ ] Shared transfer queue respects concurrency limits
- [ ] Unit tests cover all transfer combinations

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 275-366)
- SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
