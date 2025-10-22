# Phase 1.4: Local Storage API Routes

> **Task ID**: phase-1.4
> **Estimated Effort**: 1.5-2 days
> **Dependencies**: Phase 1.2 (Configuration), Phase 1.3 (Local Storage Utils)

## Objective

Implement Fastify plugin with REST API routes for local storage operations (list, upload, download, delete files/directories). Routes use validated paths and proper HTTP status codes.

## Files to Create

- `backend/src/routes/api/local/index.ts` - Fastify plugin
- `backend/src/__tests__/routes/api/local/index.test.ts` - Route tests

## Key Routes

**Note**: Use correct Fastify wildcard syntax: `:path*` instead of `/*`

### GET /api/local/locations

```typescript
// Returns all configured storage locations
app.get('/api/local/locations', async (request, reply) => {
  const locations = await getStorageLocations(request.log);
  return { locations };
});
```

### GET /api/local/files/:locationId/:path\*

```typescript
// List files at path with pagination
app.get<{
  Params: { locationId: string; path?: string };
  Querystring: { limit?: string; offset?: string };
}>('/api/local/files/:locationId/:path*', async (request, reply) => {
  const { locationId, path: relativePath = '' } = request.params;
  const limit = request.query.limit ? parseInt(request.query.limit) : undefined;
  const offset = request.query.offset ? parseInt(request.query.offset) : 0;

  try {
    const absolutePath = await validatePath(locationId, relativePath);
    const { files, totalCount } = await listDirectory(absolutePath, limit, offset);

    return {
      files,
      currentPath: relativePath,
      parentPath: relativePath ? path.dirname(relativePath) : null,
      totalCount,
    };
  } catch (error) {
    return handleError(error, reply);
  }
});
```

### POST /api/local/files/:locationId/:path\*

```typescript
// Upload file with multipart streaming
app.post<{ Params: { locationId: string; path?: string } }>(
  '/api/local/files/:locationId/:path*',
  async (request, reply) => {
    const { locationId, path: relativePath = '' } = request.params;

    try {
      const absolutePath = await validatePath(locationId, relativePath);
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      const filePath = path.join(absolutePath, data.filename);

      // Check if file exists (conflict detection)
      try {
        await fs.access(filePath);
        return reply.code(409).send({ error: 'File already exists' });
      } catch {}

      // Check file size
      let totalSize = 0;
      const maxSize = getMaxFileSizeBytes();

      await pipeline(
        data.file,
        new Transform({
          transform(chunk, encoding, callback) {
            totalSize += chunk.length;
            if (totalSize > maxSize) {
              callback(new Error('File too large'));
            } else {
              callback(null, chunk);
            }
          },
        }),
        fs.createWriteStream(filePath),
      );

      return { uploaded: true, path: data.filename };
    } catch (error) {
      return handleError(error, reply);
    }
  },
);
```

### GET /api/local/download/:locationId/:path\*

```typescript
// Download file with streaming
app.get<{ Params: { locationId: string; path?: string } }>(
  '/api/local/download/:locationId/:path*',
  async (request, reply) => {
    const { locationId, path: relativePath } = request.params;

    try {
      const absolutePath = await validatePath(locationId, relativePath || '');
      await checkFileSize(absolutePath);

      const metadata = await getFileMetadata(absolutePath);
      const stream = await streamFile(absolutePath);

      reply
        .type('application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${metadata.name}"`)
        .header('Content-Length', metadata.size || 0)
        .send(stream);
    } catch (error) {
      return handleError(error, reply);
    }
  },
);
```

### DELETE /api/local/files/:locationId/:path\*

```typescript
// Delete file or directory
app.delete<{ Params: { locationId: string; path?: string } }>(
  '/api/local/files/:locationId/:path*',
  async (request, reply) => {
    const { locationId, path: relativePath } = request.params;

    try {
      const absolutePath = await validatePath(locationId, relativePath || '');
      const itemCount = await deleteFileOrDirectory(absolutePath);

      return { deleted: true, itemCount };
    } catch (error) {
      return handleError(error, reply);
    }
  },
);
```

### POST /api/local/directories/:locationId/:path\*

```typescript
// Create directory
app.post<{ Params: { locationId: string; path?: string } }>(
  '/api/local/directories/:locationId/:path*',
  async (request, reply) => {
    const { locationId, path: relativePath } = request.params;

    try {
      const absolutePath = await validatePath(locationId, relativePath || '');
      await createDirectory(absolutePath);

      return { created: true, path: relativePath };
    } catch (error) {
      return handleError(error, reply);
    }
  },
);
```

## Error Handling

```typescript
function handleError(error: any, reply: FastifyReply) {
  if (error instanceof SecurityError) {
    return reply.code(403).send({ error: 'Forbidden', message: error.message });
  }
  if (error instanceof NotFoundError) {
    return reply.code(404).send({ error: 'Not Found', message: error.message });
  }
  if (error instanceof PermissionError) {
    return reply.code(403).send({ error: 'Permission Denied', message: error.message });
  }
  if (error instanceof StorageError) {
    if (error.message.includes('Disk full')) {
      return reply.code(507).send({ error: 'Insufficient Storage', message: error.message });
    }
    if (error.message.includes('too large')) {
      return reply.code(413).send({ error: 'Payload Too Large', message: error.message });
    }
  }
  return reply.code(500).send({ error: 'Internal Server Error', message: error.message });
}
```

## Acceptance Criteria

- [ ] All routes implemented with correct Fastify syntax
- [ ] Path validation applied to all routes
- [ ] File uploads support multipart streaming
- [ ] File downloads include proper headers
- [ ] Conflict detection (409) for existing files
- [ ] File size limits enforced (413 response)
- [ ] Pagination works for file listings
- [ ] Error handling maps to correct HTTP status codes
- [ ] Unit tests cover all routes and error cases
- [ ] Integration tests with mock filesystem pass

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 196-273)
- Fastify multipart: https://github.com/fastify/fastify-multipart
