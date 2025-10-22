import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import {
  validatePath,
  getStorageLocations,
  listDirectory,
  createDirectory,
  deleteFileOrDirectory,
  getFileMetadata,
  streamFile,
  checkFileSize,
  SecurityError,
  NotFoundError,
  PermissionError,
  StorageError,
} from '../../../utils/localStorage';
import { getMaxFileSizeBytes } from '../../../utils/config';
import { logAccess } from '../../../utils/logAccess';

/**
 * Error handler for local storage operations
 */
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
    if (error.message.includes('too large') || error.message.includes('File too large')) {
      return reply.code(413).send({ error: 'Payload Too Large', message: error.message });
    }
  }
  return reply.code(500).send({ error: 'Internal Server Error', message: error.message });
}

export default async (fastify: FastifyInstance): Promise<void> => {
  /**
   * GET /api/local/locations
   * Returns all configured storage locations with availability status
   */
  fastify.get('/locations', async (req: FastifyRequest) => {
    logAccess(req);
    const locations = await getStorageLocations(req.log);
    return { locations };
  });

  /**
   * GET /api/local/files/:locationId/*
   * List files at the given path with pagination support
   */
  fastify.get<{
    Params: { locationId: string; '*'?: string };
    Querystring: { limit?: string; offset?: string };
  }>('/files/:locationId/*', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { locationId } = req.params as any;
    const relativePath = (req.params as any)['*'] || '';
    const query = req.query as any;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    try {
      const absolutePath = await validatePath(locationId, relativePath);
      const { files, totalCount } = await listDirectory(absolutePath, limit, offset);

      let parentPath = null;
      if (relativePath) {
        const parent = path.dirname(relativePath);
        // path.dirname('subdir') returns '.', which we keep
        // path.dirname('a/b') returns 'a'
        // Only set to null if we're at root
        parentPath = parent === relativePath ? null : parent;
      }

      return {
        files,
        currentPath: relativePath,
        parentPath,
        totalCount,
      };
    } catch (error: any) {
      return handleError(error, reply);
    }
  });

  /**
   * POST /api/local/files/:locationId/*
   * Upload a file with multipart streaming and size validation
   */
  fastify.post<{
    Params: { locationId: string; '*'?: string };
  }>('/files/:locationId/*', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { locationId } = req.params as any;
    const relativePath = (req.params as any)['*'] || '';

    try {
      const absolutePath = await validatePath(locationId, relativePath);

      let data;
      try {
        data = await req.file();
      } catch (fileError: any) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No file provided' });
      }

      if (!data) {
        return reply.code(400).send({ error: 'Bad Request', message: 'No file provided' });
      }

      const filePath = path.join(absolutePath, data.filename);

      // Check if file exists (conflict detection)
      try {
        await fs.access(filePath);
        return reply.code(409).send({ error: 'Conflict', message: 'File already exists' });
      } catch {
        // File doesn't exist, continue with upload
      }

      // Stream upload with size validation
      let totalSize = 0;
      const maxSize = getMaxFileSizeBytes();

      await pipeline(
        data.file,
        new Transform({
          transform(chunk, encoding, callback) {
            totalSize += chunk.length;
            if (totalSize > maxSize) {
              callback(new StorageError('File too large'));
            } else {
              callback(null, chunk);
            }
          },
        }),
        createWriteStream(filePath),
      );

      return { uploaded: true, path: data.filename };
    } catch (error: any) {
      return handleError(error, reply);
    }
  });

  /**
   * GET /api/local/download/:locationId/*
   * Download a file with streaming and proper headers
   */
  fastify.get<{
    Params: { locationId: string; '*'?: string };
  }>('/download/:locationId/*', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { locationId } = req.params as any;
    const relativePath = (req.params as any)['*'] || '';

    try {
      const absolutePath = await validatePath(locationId, relativePath);
      await checkFileSize(absolutePath);

      const metadata = await getFileMetadata(absolutePath);
      const stream = await streamFile(absolutePath);

      reply
        .type('application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${metadata.name}"`)
        .header('Content-Length', metadata.size || 0)
        .send(stream);
    } catch (error: any) {
      return handleError(error, reply);
    }
  });

  /**
   * DELETE /api/local/files/:locationId/*
   * Delete a file or directory recursively
   */
  fastify.delete<{
    Params: { locationId: string; '*'?: string };
  }>('/files/:locationId/*', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { locationId } = req.params as any;
    const relativePath = (req.params as any)['*'] || '';

    try {
      const absolutePath = await validatePath(locationId, relativePath);
      const itemCount = await deleteFileOrDirectory(absolutePath);

      return { deleted: true, itemCount };
    } catch (error: any) {
      return handleError(error, reply);
    }
  });

  /**
   * POST /api/local/directories/:locationId/*
   * Create a directory (mkdir -p behavior)
   */
  fastify.post<{
    Params: { locationId: string; '*'?: string };
  }>('/directories/:locationId/*', async (req: FastifyRequest, reply: FastifyReply) => {
    logAccess(req);
    const { locationId } = req.params as any;
    const relativePath = (req.params as any)['*'] || '';

    try {
      const absolutePath = await validatePath(locationId, relativePath);
      await createDirectory(absolutePath);

      return { created: true, path: relativePath };
    } catch (error: any) {
      return handleError(error, reply);
    }
  });
};
