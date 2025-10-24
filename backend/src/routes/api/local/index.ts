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
import { authenticateUser, authorizeLocation } from '../../../plugins/auth';
import { auditLog } from '../../../utils/auditLog';
import { validateFileType } from '../../../utils/fileValidation';
import { checkQuota, updateQuota } from '../../../utils/quotaManager';
import { checkRateLimit, getRateLimitResetTime } from '../../../utils/rateLimit';

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
  // 🔐 SECURITY: Rate limiting for expensive operations
  const RATE_LIMIT_UPLOAD = 20; // requests per minute
  const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

  /**
   * Authentication hook - authenticates all requests to /api/local/*
   */
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticateUser(request, reply);
  });

  /**
   * Authorization hook - checks locationId access for routes with locationId parameter
   */
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as any;
    if (params.locationId && request.user) {
      try {
        authorizeLocation(request.user, params.locationId);
      } catch (error: any) {
        auditLog(request.user, 'access', `local:${params.locationId}`, 'denied', error.message);
        return reply.code(403).send({
          error: 'Forbidden',
          message: error.message,
        });
      }
    }
  });

  /**
   * Audit logging hook - logs all requests after completion
   */
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user) {
      const params = request.params as any;
      const resource = params.locationId
        ? `local:${params.locationId}/${params['*'] || ''}`
        : 'local:locations';
      const status = reply.statusCode >= 200 && reply.statusCode < 300 ? 'success' : 'failure';
      const action = request.method.toLowerCase();
      auditLog(request.user, action, resource, status);
    }
  });

  /**
   * GET /api/local/locations
   * Returns all configured storage locations with availability status
   * Filtered by user's allowedLocations (unless user has admin role)
   */
  fastify.get('/locations', async (req: FastifyRequest) => {
    logAccess(req);
    const allLocations = await getStorageLocations(req.log);

    // Filter locations based on user permissions
    if (!req.user) {
      return { locations: [] };
    }

    // Admin role gets all locations
    if (req.user.roles.includes('admin')) {
      return { locations: allLocations };
    }

    // Filter to only allowed locations
    const filteredLocations = allLocations.filter((location) =>
      req.user!.allowedLocations.includes(location.id),
    );

    return { locations: filteredLocations };
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

    // 🔐 SECURITY: Rate limiting for upload requests (expensive operation)
    const clientIp = req.ip || 'unknown';
    const rateLimitKey = `upload:${clientIp}`;

    if (checkRateLimit(rateLimitKey, RATE_LIMIT_UPLOAD, RATE_LIMIT_WINDOW_MS)) {
      const retryAfter = getRateLimitResetTime(rateLimitKey);
      return reply.code(429).send({
        error: 'RateLimitExceeded',
        message: `Too many upload requests. Maximum ${RATE_LIMIT_UPLOAD} per minute.`,
        retryAfter,
      });
    }

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

      // Validate file type
      const { allowed, reason } = validateFileType(data.filename);
      if (!allowed) {
        return reply.code(400).send({
          error: 'InvalidFileType',
          message: reason,
        });
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

      // Check quota before upload (conservative estimate - we'll update with actual size after)
      const quotaCheck = checkQuota(locationId, maxSize, 1);
      if (!quotaCheck.allowed) {
        return reply.code(413).send({
          error: 'QuotaExceeded',
          message: quotaCheck.reason,
        });
      }

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

      // Update quota after successful upload with actual file size
      updateQuota(locationId, totalSize, 1);

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

      // Get file/directory size before deletion for quota update
      let totalSize = 0;
      let fileCount = 0;

      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        // Calculate total size of directory contents
        const entries = await fs.readdir(absolutePath, { recursive: true, withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(entry.path, entry.name);
          try {
            const entryStat = await fs.stat(entryPath);
            if (entryStat.isFile()) {
              totalSize += entryStat.size;
              fileCount++;
            }
          } catch {
            // Skip inaccessible files
          }
        }
        fileCount++; // Count the directory itself
      } else {
        totalSize = stats.size;
        fileCount = 1;
      }

      const itemCount = await deleteFileOrDirectory(absolutePath);

      // Update quota after successful deletion (negative values)
      updateQuota(locationId, -totalSize, -fileCount);

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
