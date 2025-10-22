# Data Flow

This document describes how data flows through the ODH-TEC system, including API communication patterns, streaming architecture, and event-driven communication.

## Table of Contents

- [Overview](#overview)
- [API Communication Flow](#api-communication-flow)
- [File Upload Flow](#file-upload-flow)
- [File Download Flow](#file-download-flow)
- [HuggingFace Import Flow](#huggingface-import-flow)
- [Progress Tracking](#progress-tracking)
- [Event-Driven Communication](#event-driven-communication)
- [Error Propagation](#error-propagation)

## Overview

ODH-TEC uses several data flow patterns:

1. **Request-Response** - Standard REST API calls (list buckets, get settings)
2. **Streaming Upload** - Computer → Backend → S3
3. **Streaming Download** - S3 → Backend → Browser
4. **Streaming Import** - HuggingFace → Backend → S3
5. **Server-Sent Events** - Real-time progress updates
6. **Event Emitter** - Frontend cross-component communication

## API Communication Flow

### Standard Request-Response

**Pattern**: Frontend ↔ Backend ↔ S3/External Service

```
┌─────────────┐
│   Browser   │
│  (React)    │
└──────┬──────┘
       │
       │ 1. HTTP Request (axios)
       │    GET /api/buckets
       ▼
┌─────────────┐
│   Fastify   │
│  (Backend)  │
└──────┬──────┘
       │
       │ 2. S3 Command
       │    ListBucketsCommand
       ▼
┌─────────────┐
│ S3 Storage  │
└──────┬──────┘
       │
       │ 3. Bucket List Response
       ▼
┌─────────────┐
│   Fastify   │
│  (Backend)  │
└──────┬──────┘
       │
       │ 4. JSON Response
       │    { buckets: [...] }
       ▼
┌─────────────┐
│   Browser   │
│  (React)    │
└─────────────┘
```

### Example: List Buckets

**Frontend** (`Buckets.tsx`):

```typescript
const fetchBuckets = async () => {
  setLoading(true);
  try {
    const response = await axios.get('/api/buckets');
    setBuckets(response.data.buckets);
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
};
```

**Backend** (`routes/api/buckets/index.ts`):

```typescript
fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
  const { s3Client } = getS3Config();

  try {
    const command = new ListBucketsCommand({});
    const data = await s3Client.send(command);

    reply.send({ buckets: data.Buckets });
  } catch (error) {
    // Error handling
  }
});
```

### Request Flow Details

1. **User Interaction** - User clicks "Refresh Buckets"
2. **Component Handler** - React onClick handler fires
3. **State Update** - `setLoading(true)` shows spinner
4. **API Call** - Axios GET request to `/api/buckets`
5. **Backend Route** - Fastify route handler processes request
6. **S3 Command** - AWS SDK sends ListBucketsCommand
7. **S3 Response** - S3 returns bucket list
8. **JSON Response** - Backend sends JSON to frontend
9. **State Update** - `setBuckets()` updates component state
10. **UI Render** - React re-renders with bucket list

## File Upload Flow

### Streaming Upload Architecture

**Pattern**: Computer → Backend (streaming) → S3 (streaming)

```
┌─────────────┐
│   Browser   │
│  File Input │
└──────┬──────┘
       │
       │ 1. File Selection
       │    File objects (in memory)
       ▼
┌─────────────┐
│   React     │
│  Component  │
└──────┬──────┘
       │
       │ 2. FormData Upload
       │    POST /api/objects/upload/:bucket
       │    Content-Type: multipart/form-data
       ▼
┌─────────────────────────────────────────┐
│          Fastify Backend                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  @fastify/multipart             │   │
│  │  Parses stream (no buffering)   │   │
│  └──────────────┬──────────────────┘   │
│                 │                       │
│                 │ 3. File Stream        │
│                 ▼                       │
│  ┌─────────────────────────────────┐   │
│  │  @aws-sdk/lib-storage           │   │
│  │  Upload (multipart to S3)       │   │
│  │  - Chunks file (5MB parts)      │   │
│  │  - Streams each part            │   │
│  │  - Emits progress events        │   │
│  └──────────────┬──────────────────┘   │
└─────────────────┼───────────────────────┘
                  │
                  │ 4. S3 PutObject (streaming)
                  ▼
        ┌─────────────────┐
        │   S3 Storage    │
        │   Bucket/Key    │
        └─────────────────┘
```

### Detailed Upload Flow

**Frontend Upload** (`ObjectBrowser.tsx`):

```typescript
const handleUpload = async (files: File[]) => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  try {
    await axios.post(`/api/objects/upload/${bucketName}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadProgress(percentCompleted);
      },
    });

    emitter.emit('upload-complete');
  } catch (error) {
    emitter.emit('upload-error', error);
  }
};
```

**Backend Upload** (`routes/api/objects/index.ts`):

```typescript
fastify.post('/upload/:bucketName', async (req, reply) => {
  const files = req.files(); // AsyncIterator
  const limit = pLimit(getMaxConcurrentTransfers());
  const uploadPromises = [];

  for await (const file of files) {
    const uploadTask = limit(async () => {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: file.filename,
          Body: file.file, // Stream (no buffering)
        },
      });

      upload.on('httpUploadProgress', (progress) => {
        // Emit SSE progress event
      });

      return await upload.done();
    });

    uploadPromises.push(uploadTask);
  }

  await Promise.all(uploadPromises);
  reply.send({ status: 'success' });
});
```

### Memory Efficiency

**Key Points**:

- File never fully loaded into backend memory
- Streaming from browser to S3 with intermediate buffering only
- Multipart upload for large files (5MB chunks)
- Concurrent upload limits prevent memory exhaustion

**Memory Usage**:

```
Base:        ~100-200 MB (Node.js + Fastify)
Per upload:  ~50-100 MB  (buffering)
2 concurrent: ~200-400 MB total
```

## File Download Flow

### Streaming Download Architecture

**Pattern**: S3 → Backend (streaming) → Browser (streaming)

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. Download Request
       │    GET /api/objects/download/:bucket/:key
       ▼
┌──────────────────────────────────────┐
│       Fastify Backend                │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  GetObjectCommand              │ │
│  │  Fetch from S3                 │ │
│  └──────────┬─────────────────────┘ │
│             │                        │
│             │ 2. S3 Response Stream  │
│             ▼                        │
│  ┌────────────────────────────────┐ │
│  │  Stream to Client              │ │
│  │  - Set Content-Disposition     │ │
│  │  - Set Content-Type            │ │
│  │  - Pipe stream to response     │ │
│  └──────────┬─────────────────────┘ │
└─────────────┼────────────────────────┘
              │
              │ 3. HTTP Response Stream
              ▼
        ┌─────────────┐
        │   Browser   │
        │  Save File  │
        └─────────────┘
```

### Download Implementation

**Frontend Download** (`ObjectBrowser.tsx`):

```typescript
const handleDownload = async (key: string, filename: string) => {
  try {
    const encodedKey = btoa(key);
    const response = await axios.get(`/api/objects/download/${bucketName}/${encodedKey}`, {
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('Download failed:', error);
  }
};
```

**Backend Download** (`routes/api/objects/index.ts`):

```typescript
fastify.get('/download/:bucketName/:encodedKey', async (req, reply) => {
  const key = atob(encodedKey);

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const item = await s3Client.send(command);

  // Set response headers
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  reply.header('Content-Type', item.ContentType || 'application/octet-stream');

  // Stream directly to client
  return item.Body;
});
```

### Streaming Benefits

- No file size limits (independent of available RAM)
- Minimal memory usage
- Fast time-to-first-byte
- Direct passthrough (no disk I/O)

## HuggingFace Import Flow

### Multi-Source Streaming

**Pattern**: HuggingFace → Backend → S3 (all streaming)

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ 1. Import Request
       │    POST /api/objects/import-hf
       │    { repo, token, bucket, prefix }
       ▼
┌───────────────────────────────────────────────┐
│            Fastify Backend                    │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │  1. Fetch HF Model Metadata             │ │
│  │     GET https://huggingface.co/api/...  │ │
│  └──────────────┬──────────────────────────┘ │
│                 │                             │
│                 │ 2. File list response       │
│                 ▼                             │
│  ┌─────────────────────────────────────────┐ │
│  │  For each file:                         │ │
│  │                                         │ │
│  │  ┌───────────────────────────────────┐ │ │
│  │  │ 3. Stream from HuggingFace        │ │ │
│  │  │    axios({ responseType: 'stream'})│ │ │
│  │  └────────┬──────────────────────────┘ │ │
│  │           │                             │ │
│  │           │ 4. HF file stream           │ │
│  │           ▼                             │ │
│  │  ┌───────────────────────────────────┐ │ │
│  │  │ 5. Upload to S3                   │ │ │
│  │  │    Upload({ Body: stream })       │ │ │
│  │  └────────┬──────────────────────────┘ │ │
│  │           │                             │ │
│  │           │ 6. SSE progress events      │ │
│  │           ▼                             │ │
│  │  ┌───────────────────────────────────┐ │ │
│  │  │ Send progress to client           │ │ │
│  │  └───────────────────────────────────┘ │ │
│  └─────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
       │           │
       │           │ S3 PutObject (streaming)
       │           ▼
       │    ┌─────────────┐
       │    │ S3 Storage  │
       │    └─────────────┘
       │
       │ SSE Progress Updates
       ▼
┌─────────────┐
│   Browser   │
│  Progress   │
│   Updates   │
└─────────────┘
```

### Implementation Details

**Backend HF Import** (`routes/api/objects/index.ts`):

```typescript
fastify.post('/import-hf', async (req, reply) => {
  reply.sse(
    (async function* () {
      // 1. Fetch model metadata
      yield { data: JSON.stringify({ status: 'fetching-metadata' }) };

      const siblings = await fetchHFModelFiles(repo, token);

      // 2. Stream each file
      for (const sibling of siblings) {
        yield {
          data: JSON.stringify({
            status: 'uploading',
            file: sibling.rfilename,
          }),
        };

        // 3. Stream from HuggingFace
        const response = await axios.get(downloadUrl, {
          responseType: 'stream',
          httpAgent: httpProxy ? new HttpProxyAgent(httpProxy) : undefined,
        });

        // 4. Upload to S3 (streaming)
        const upload = new Upload({
          client: s3Client,
          params: {
            Bucket: bucketName,
            Key: `${prefix}${sibling.rfilename}`,
            Body: response.data, // Stream directly
          },
        });

        await upload.done();
      }

      yield { data: JSON.stringify({ status: 'completed' }) };
    })(),
  );
});
```

**Frontend SSE Handling** (`ObjectBrowser.tsx`):

```typescript
const importFromHF = async (repo: string, token?: string) => {
  const eventSource = new EventSource(
    `/api/objects/import-hf?repo=${repo}&token=${token}&bucket=${bucketName}`,
  );

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.status) {
      case 'fetching-metadata':
        setImportStatus('Fetching model metadata...');
        break;
      case 'uploading':
        setImportStatus(`Uploading ${data.file}...`);
        break;
      case 'completed':
        setImportStatus('Import completed');
        eventSource.close();
        break;
    }
  };

  eventSource.onerror = () => {
    setImportStatus('Import failed');
    eventSource.close();
  };
};
```

### Memory Efficiency for Large Models

**Example**: 7B parameter model (~14GB)

**Traditional Approach** (would fail):

```
Download entire model → 14GB RAM
Upload to S3 → 14GB RAM + network
Total: 28GB RAM required
```

**Streaming Approach** (ODH-TEC):

```
Stream chunks from HF → ~50-100MB buffer
Upload chunks to S3 → ~50-100MB buffer
Total: ~200MB RAM maximum
```

## Progress Tracking

### Server-Sent Events (SSE)

**Pattern**: Backend → Frontend (one-way, real-time)

```
Backend                    Frontend
   │                          │
   │  ───────────────────────▶│  Event: progress
   │  { file: 'model.bin',    │
   │    progress: 25% }        │
   │                          │
   │  ───────────────────────▶│  Event: progress
   │  { file: 'model.bin',    │
   │    progress: 50% }        │
   │                          │
   │  ───────────────────────▶│  Event: complete
   │  { status: 'done' }      │
   │                          │
```

**SSE Setup** (Backend):

```typescript
reply.sse(
  (async function* () {
    for (const item of items) {
      await processItem(item);
      yield {
        data: JSON.stringify({
          item: item.name,
          progress: calculateProgress(),
        }),
      };
    }
  })(),
);
```

**SSE Consumption** (Frontend):

```typescript
const eventSource = new EventSource('/api/endpoint');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setProgress(data.progress);
};

eventSource.onerror = () => {
  eventSource.close();
};
```

## Event-Driven Communication

### Frontend EventEmitter

**Pattern**: Component A → EventEmitter → Component B

```
ObjectBrowser (Component A)
        │
        │ emitter.emit('upload-complete')
        ▼
┌──────────────────┐
│  Event Emitter   │
│  (emitter.ts)    │
└────────┬─────────┘
         │
         │ handler('upload-complete')
         ▼
AppLayout (Component B)
```

**Implementation**:

**Emitter** (`utils/emitter.ts`):

```typescript
import EventEmitter from 'eventemitter3';
const emitter = new EventEmitter();
export default emitter;
```

**Emit Event** (Component A):

```typescript
import emitter from '@app/utils/emitter';

const handleUploadComplete = () => {
  emitter.emit('upload-complete', { filename: 'file.txt' });
};
```

**Listen to Event** (Component B):

```typescript
import emitter from '@app/utils/emitter';

useEffect(() => {
  const handler = (data) => {
    console.log('Upload completed:', data.filename);
    refreshList();
  };

  emitter.on('upload-complete', handler);

  return () => {
    emitter.off('upload-complete', handler);
  };
}, []);
```

### Common Events

| Event             | Emitter       | Listener      | Purpose                 |
| ----------------- | ------------- | ------------- | ----------------------- |
| `upload-progress` | ObjectBrowser | ProgressBar   | File upload progress    |
| `upload-complete` | ObjectBrowser | ObjectBrowser | Refresh file list       |
| `import-progress` | ObjectBrowser | ProgressBar   | HF import progress      |
| `error`           | Any           | AppLayout     | Show error notification |

## Error Propagation

### Error Flow

```
┌─────────────┐
│  S3 Storage │
│  (Error)    │
└──────┬──────┘
       │
       │ S3ServiceException
       ▼
┌─────────────┐
│   Backend   │
│  Error      │
│  Handler    │
└──────┬──────┘
       │
       │ HTTP Status + JSON
       │ { error: "AccessDenied",
       │   message: "..." }
       ▼
┌─────────────┐
│  Frontend   │
│  Axios      │
│  Catch      │
└──────┬──────┘
       │
       │ setError(message)
       ▼
┌─────────────┐
│  Component  │
│  Alert/     │
│  Toast      │
└─────────────┘
```

### Error Handling Chain

**S3 Error**:

```typescript
// Backend
catch (error) {
  if (error instanceof S3ServiceException) {
    reply.code(403).send({
      error: 'AccessDenied',
      message: 'You do not have permission to access this bucket'
    });
  }
}
```

**HTTP Error**:

```typescript
// Frontend
catch (error) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message ||
                   'An error occurred';
    setError(message);
  }
}
```

**UI Display**:

```typescript
// Component
{error && (
  <Alert variant="danger" title="Error">
    {error}
  </Alert>
)}
```

---

**Next**:

- [Backend Architecture](backend-architecture.md) - API implementation details
- [Frontend Architecture](frontend-architecture.md) - UI component details
- [System Architecture](system-architecture.md) - High-level system design
- [Deployment](../../deployment/deployment.md) - Container build and deployment
