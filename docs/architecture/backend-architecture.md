# Backend Architecture

This document provides a comprehensive overview of the ODH-TEC backend architecture, built with Fastify and TypeScript.

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Fastify Architecture](#fastify-architecture)
- [Route Organization](#route-organization)
- [Streaming Architecture](#streaming-architecture)
- [Configuration Management](#configuration-management)
- [Error Handling](#error-handling)
- [Logging](#logging)
- [Testing](#testing)

## Overview

The backend is a **Fastify-based Node.js application** that provides:

- RESTful API for S3 operations
- Streaming file upload/download
- HuggingFace model import
- Runtime configuration management
- Static file serving (production)

**Key Characteristics**:

- TypeScript for type safety
- Plugin-based architecture
- Streaming-first design
- Stateless operation
- Memory-efficient (~256MB for 7B model import)

## Technology Stack

The backend uses **Fastify** as the core framework with TypeScript for type safety. Key technologies include:

- **Core**: Fastify 4.28.1, Node.js 18+, TypeScript 5.3.3
- **AWS Integration**: AWS SDK v3 (S3 client, lib-storage for multipart uploads)
- **Streaming & Utilities**: Axios, p-limit, Pino (logging)
- **Development**: ts-node, nodemon, jest, eslint

> **For complete technology inventory**, see [Technology Stack](technology-stack.md).

## Project Structure

The backend follows a clean plugin-based architecture with organized directories:

- **`src/routes/`** - Auto-loaded API route handlers (buckets, objects, settings, etc.)
- **`src/plugins/`** - Auto-loaded Fastify plugins
- **`src/utils/`** - Configuration management, logging, constants
- **`src/__tests__/`** - Jest test files
- **`dist/`** - Compiled JavaScript output

> **For complete repository structure and monorepo organization**, see [Monorepo Structure](monorepo-structure.md).

## Fastify Architecture

### Application Initialization

**File**: `src/app.ts`

```typescript
export async function initializeApp(opts = {}): Promise<FastifyInstance> {
  const app: FastifyInstance = fastify({
    logger: pino({ level: LOG_LEVEL }, transport),
  });

  // Register core plugins
  app.register(cors, { origin: '*', methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'] });
  app.register(sensible);
  app.register(multipart);
  app.register(websocket);

  // Autoload plugins from plugins/ directory
  app.register(fastifyAutoload, {
    dir: path.join(__dirname, 'plugins'),
    options: Object.assign({}, opts),
  });

  // Autoload routes from routes/ directory
  app.register(fastifyAutoload, {
    dir: path.join(__dirname, 'routes'),
    options: Object.assign({}, opts),
  });

  // Serve frontend static files in production
  if (APP_ENV === 'production') {
    app.register(fastifyStatic, {
      root: path.join(__dirname, '../../frontend/dist'),
      wildcard: false,
    });
  }

  return app;
}
```

### Plugin Pattern

**All routes are Fastify plugins**. Each route file exports an async function:

```typescript
// src/routes/api/buckets/index.ts
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export default async (fastify: FastifyInstance): Promise<void> => {
  // Register route handlers
  fastify.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    // Handler logic
  });
};
```

**Why Plugin Pattern?**

- Encapsulation and isolation
- Automatic registration via autoload
- Access to Fastify decorators
- Lifecycle hooks support
- Testability

### Autoload Mechanism

The `@fastify/autoload` plugin automatically discovers and registers:

1. **Plugins**: Files in `src/plugins/`
2. **Routes**: Files in `src/routes/`

**Discovery Rules**:

- Files must export default async function
- Directory structure maps to URL paths
- `index.ts` maps to directory path

**Example**:

```
src/routes/api/buckets/index.ts  →  /api/buckets
src/routes/api/objects/index.ts  →  /api/objects
src/routes/root.ts               →  /
```

## Route Organization

### Route Structure

```
/api/
├── /buckets
│   ├── GET    /              List all buckets
│   ├── POST   /              Create bucket
│   └── DELETE /:bucketName   Delete bucket
│
├── /objects
│   ├── GET    /:bucketName                    List objects (root)
│   ├── GET    /:bucketName/:prefix            List objects (prefix)
│   ├── GET    /view/:bucketName/:encodedKey   View object
│   ├── GET    /download/:bucketName/:encodedKey  Download object
│   ├── POST   /upload/:bucketName             Upload to root
│   ├── POST   /upload/:bucketName/:prefix     Upload to prefix
│   ├── POST   /import-hf                      Import from HuggingFace
│   ├── DELETE /:bucketName/:encodedKey        Delete single object
│   └── DELETE /multiple/:bucketName           Delete multiple objects
│
├── /settings
│   ├── GET    /s3                 Get S3 config
│   ├── PUT    /s3                 Update S3 config
│   ├── POST   /test-s3            Test S3 connection
│   ├── GET    /hf                 Get HF token
│   ├── PUT    /hf                 Update HF token
│   ├── GET    /proxy              Get proxy config
│   ├── PUT    /proxy              Update proxy config
│   ├── GET    /max-concurrent-transfers  Get limit
│   └── PUT    /max-concurrent-transfers  Set limit
│
└── /disclaimer
    └── GET    /                   Get app info
```

### Route Handler Pattern

**Standard pattern for all routes**:

```typescript
fastify.get('/endpoint', async (req: FastifyRequest, reply: FastifyReply) => {
  logAccess(req); // 1. Log access

  const { s3Client } = getS3Config(); // 2. Get S3 client

  try {
    // 3. Business logic
    const command = new SomeS3Command({
      /* params */
    });
    const result = await s3Client.send(command);

    // 4. Success response
    reply.send({ data: result });
  } catch (error) {
    // 5. Error handling
    if (error instanceof S3ServiceException) {
      const statusCode = error.$metadata?.httpStatusCode || 500;
      reply.code(statusCode).send({
        error: error.name,
        message: error.message,
      });
    } else {
      reply.code(500).send({
        error: 'Unknown error',
        message: error.message,
      });
    }
  }
});
```

### Path Parameters

**Base64 encoding for S3 prefixes**:

```typescript
// Frontend encodes prefix
const encodedPrefix = btoa('folder/subfolder/');
// URL: /api/objects/my-bucket/Zm9sZGVyL3N1YmZvbGRlci8=

// Backend decodes prefix
const { prefix } = req.params as any;
const decoded_prefix = prefix ? atob(prefix) : '';
// Result: 'folder/subfolder/'
```

**Why base64?**

- Handles slashes in URL paths
- Prevents routing issues
- Supports special characters

## Streaming Architecture

### Core Principle

**All file operations use streaming** - files never fully loaded into memory.

### Upload Flow

**Pattern**: Computer → Backend → S3

```typescript
// src/routes/api/objects/index.ts
fastify.post('/upload/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
  const files = req.files(); // AsyncIterator of MultipartFile

  const limit = pLimit(getMaxConcurrentTransfers()); // Concurrency control
  const uploadPromises = [];

  for await (const file of files) {
    const uploadTask = limit(async () => {
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: file.filename,
          Body: file.file, // Stream directly from request
        },
      });

      // Track progress
      upload.on('httpUploadProgress', (progress) => {
        // Emit progress events
      });

      return await upload.done();
    });

    uploadPromises.push(uploadTask);
  }

  await Promise.all(uploadPromises);
  reply.send({ status: 'success' });
});
```

### Download Flow

**Pattern**: S3 → Backend → Browser

```typescript
fastify.get(
  '/download/:bucketName/:encodedKey',
  async (req: FastifyRequest, reply: FastifyReply) => {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const item = await s3Client.send(command);

    // Set headers
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Type', item.ContentType || 'application/octet-stream');

    // Stream directly to client
    return item.Body;
  },
);
```

### HuggingFace Import Flow

**Pattern**: HuggingFace → Backend → S3

```typescript
// Fetch file list from HF API
const siblings = await fetchHFModelFiles(repo, token);

// Stream each file
for (const sibling of siblings) {
  const response = await axios.get(downloadUrl, {
    responseType: 'stream',
    httpAgent: httpProxy ? new HttpProxyAgent(httpProxy) : undefined,
  });

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Key: `${prefix}${sibling.rfilename}`,
      Body: response.data, // Stream from HuggingFace
    },
  });

  await upload.done();
}
```

### Concurrency Control

**Using p-limit**:

```typescript
import pLimit from 'p-limit';

// Limit concurrent operations
const limit = pLimit(getMaxConcurrentTransfers()); // Default: 2

const tasks = files.map((file) =>
  limit(async () => {
    // Upload logic
  }),
);

await Promise.all(tasks);
```

**Why limit concurrency?**

- Prevent memory exhaustion
- Control network bandwidth
- Stable performance
- Configurable via `MAX_CONCURRENT_TRANSFERS`

## Configuration Management

Configuration is managed through `src/utils/config.ts` with support for:

- **Environment variables** - Loaded via dotenv at startup
- **Runtime updates** - Mutable configuration via `/api/settings` endpoints (ephemeral)
- **Auto-detection** - ODH/RHOAI Data Connection environment variables
- **Proxy support** - HTTP/HTTPS proxy configuration

Key environment variables: `AWS_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `HF_TOKEN`, `MAX_CONCURRENT_TRANSFERS`.

> **For complete configuration details**, see [Configuration Management](../../deployment/configuration.md).

## Error Handling

### S3ServiceException Pattern

**Critical**: Always separate S3 errors from generic errors

```typescript
import { S3ServiceException } from '@aws-sdk/client-s3';

try {
  // S3 operation
} catch (error) {
  if (error instanceof S3ServiceException) {
    console.error(`S3 error: ${error.name} - ${error.message}`);
    const statusCode = error.$metadata?.httpStatusCode || 500;
    reply.code(statusCode).send({
      error: error.name,
      message: error.message,
    });
  } else {
    console.error('Unexpected error:', error);
    reply.code(500).send({
      error: 'Unknown error',
      message: error.message,
    });
  }
}
```

**Why separate handling?**

- Proper HTTP status codes from S3
- Better error messages
- Debugging clarity

### HTTP Status Codes

**Consistent usage**:

- `200` - Success
- `400` - Bad request (validation errors)
- `403` - Forbidden (S3 access denied)
- `404` - Not found
- `500` - Internal server error
- `503` - Service unavailable

## Logging

### Pino Logger

**Configured in app.ts**:

```typescript
import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const APP_ENV = process.env.NODE_ENV || 'development';

const transport =
  APP_ENV === 'development'
    ? pino.transport({
        target: 'pino-pretty',
        options: { colorize: true },
      })
    : undefined;

const app = fastify({
  logger: pino(
    {
      level: LOG_LEVEL,
      redact: ['headers.Authorization', 'request.headers.Authorization'],
    },
    transport,
  ),
});
```

**Features**:

- Pretty printing in development
- JSON in production
- Credential redaction
- Configurable log levels

### Access Logging

**File**: `src/utils/logAccess.ts`

```typescript
export const logAccess = (req: FastifyRequest): void => {
  const logMessage = `${new Date().toISOString()} - ${req.method} ${req.url}`;
  console.log(logMessage);

  // Write to file
  fs.appendFileSync('logs/access.log', logMessage + '\n');
};
```

**Usage in routes**:

```typescript
fastify.get('/endpoint', async (req: FastifyRequest, reply: FastifyReply) => {
  logAccess(req); // Log every request
  // ... handler logic
});
```

## Testing

### Testing Stack

- **Jest** - Test framework
- **ts-jest** - TypeScript support
- **aws-sdk-client-mock** - Mock AWS SDK calls
- **Fastify inject** - Test routes without HTTP server

### Test Pattern

```typescript
import { FastifyInstance } from 'fastify';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { getS3Config } from '../../../utils/config';

jest.mock('../../../utils/config');

describe('Bucket Routes', () => {
  let fastify: FastifyInstance;
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
    (getS3Config as jest.Mock).mockReturnValue({
      s3Client: new S3Client({ region: 'us-east-1' }),
    });

    const Fastify = require('fastify');
    fastify = Fastify();
    fastify.register(bucketsRoutes);
  });

  it('should list buckets', async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: 'test-bucket' }],
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload).buckets).toHaveLength(1);
  });
});
```

### Running Tests

```bash
npm test                # Lint + type-check + jest
npm run test:jest      # Jest only
npm run test:lint      # ESLint
npm run test:type-check # TypeScript
```

---

**Next**:

- [Frontend Architecture](frontend-architecture.md) - React application structure
- [Data Flow](data-flow.md) - Request/response patterns
- [Configuration](../../deployment/configuration.md) - Environment and runtime config
- [Development Workflow](../../development/development-workflow.md) - Build and testing processes
