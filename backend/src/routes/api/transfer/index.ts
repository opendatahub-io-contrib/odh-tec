import { FastifyInstance } from 'fastify';
import { pipeline } from 'stream/promises';
import { Transform, Readable } from 'stream';
import { promises as fs } from 'fs';
import path from 'path';
import { GetObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getS3Config } from '../../../utils/config';
import { validatePath } from '../../../utils/localStorage';
import { transferQueue, TransferFileJob, TransferJob } from '../../../utils/transferQueue';

/**
 * Request body for transfer initiation
 */
interface TransferRequest {
  source: {
    type: 'local' | 's3';
    locationId: string;
    path: string;
  };
  destination: {
    type: 'local' | 's3';
    locationId: string;
    path: string;
  };
  files: string[];
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}

/**
 * Request body for conflict check
 */
interface ConflictCheckRequest {
  destination: {
    type: 'local' | 's3';
    locationId: string;
    path: string;
  };
  files: string[];
}

/**
 * Parse transfer path format: "type:locationId/path"
 */
function parseTransferPath(transferPath: string): [string, string, string] {
  const colonIndex = transferPath.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid transfer path format: ${transferPath}`);
  }

  const type = transferPath.substring(0, colonIndex);
  const remainder = transferPath.substring(colonIndex + 1);
  const slashIndex = remainder.indexOf('/');

  if (slashIndex === -1) {
    throw new Error(`Invalid transfer path format: ${transferPath}`);
  }

  const locationId = remainder.substring(0, slashIndex);
  const filePath = remainder.substring(slashIndex + 1);

  return [type, locationId, filePath];
}

/**
 * Check if a file exists at the given location
 */
async function checkExists(type: string, locationId: string, filePath: string): Promise<boolean> {
  try {
    if (type === 'local') {
      const absolutePath = await validatePath(locationId, filePath);
      await fs.access(absolutePath);
      return true;
    } else if (type === 's3') {
      const { s3Client } = getS3Config();
      const command = new HeadObjectCommand({
        Bucket: locationId,
        Key: filePath,
      });
      await s3Client.send(command);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Find a non-conflicting filename by appending -1, -2, etc.
 */
async function findNonConflictingName(
  type: string,
  locationId: string,
  filePath: string,
): Promise<string> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let counter = 1;
  let testPath = filePath;

  while (await checkExists(type, locationId, testPath)) {
    testPath = path.join(dir, `${baseName}-${counter}${ext}`);
    counter++;
  }

  return testPath;
}

/**
 * Transfer S3 → Local
 */
async function transferS3ToLocal(
  bucket: string,
  key: string,
  locationId: string,
  destPath: string,
  fileJob: TransferFileJob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  const absolutePath = await validatePath(locationId, destPath);
  const { s3Client } = getS3Config();

  // Ensure destination directory exists
  const destDir = path.dirname(absolutePath);
  await fs.mkdir(destDir, { recursive: true });

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('S3 response body is empty');
  }

  // Get file size from response
  fileJob.size = response.ContentLength || 0;

  let loaded = 0;
  const progressTransform = new Transform({
    transform(chunk, encoding, callback) {
      loaded += chunk.length;
      onProgress(loaded);
      callback(null, chunk);
    },
  });

  const { createWriteStream } = await import('fs');
  await pipeline(response.Body as Readable, progressTransform, createWriteStream(absolutePath));
}

/**
 * Transfer Local → S3
 */
async function transferLocalToS3(
  locationId: string,
  sourcePath: string,
  bucket: string,
  key: string,
  fileJob: TransferFileJob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  const absolutePath = await validatePath(locationId, sourcePath);
  const { s3Client } = getS3Config();

  // Get file size
  const stats = await fs.stat(absolutePath);
  fileJob.size = stats.size;

  const { createReadStream } = await import('fs');
  const fileStream = createReadStream(absolutePath);

  const upload = new Upload({
    client: s3Client,
    params: { Bucket: bucket, Key: key, Body: fileStream },
  });

  upload.on('httpUploadProgress', (progress) => {
    onProgress(progress.loaded || 0);
  });

  await upload.done();
}

/**
 * Transfer Local → Local
 */
async function transferLocalToLocal(
  sourceLoc: string,
  sourcePath: string,
  destLoc: string,
  destPath: string,
  fileJob: TransferFileJob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  const sourceAbsolute = await validatePath(sourceLoc, sourcePath);
  const destAbsolute = await validatePath(destLoc, destPath);

  // Ensure destination directory exists
  const destDir = path.dirname(destAbsolute);
  await fs.mkdir(destDir, { recursive: true });

  // Get file size
  const stats = await fs.stat(sourceAbsolute);
  fileJob.size = stats.size;

  let loaded = 0;
  const progressTransform = new Transform({
    transform(chunk, encoding, callback) {
      loaded += chunk.length;
      onProgress(loaded);
      callback(null, chunk);
    },
  });

  const { createReadStream, createWriteStream } = await import('fs');
  await pipeline(
    createReadStream(sourceAbsolute),
    progressTransform,
    createWriteStream(destAbsolute),
  );
}

/**
 * Transfer S3 → S3
 */
async function transferS3ToS3(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
  fileJob: TransferFileJob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  const { s3Client } = getS3Config();

  // Get source object size
  const headCommand = new HeadObjectCommand({
    Bucket: sourceBucket,
    Key: sourceKey,
  });
  const headResponse = await s3Client.send(headCommand);
  fileJob.size = headResponse.ContentLength || 0;

  // Copy object
  const copyCommand = new CopyObjectCommand({
    Bucket: destBucket,
    Key: destKey,
    CopySource: `${sourceBucket}/${sourceKey}`,
  });

  await s3Client.send(copyCommand);

  // S3 copy is atomic, report full progress
  onProgress(fileJob.size);
}

/**
 * Execute transfer based on source and destination types
 */
async function executeTransfer(
  fileJob: TransferFileJob,
  source: TransferRequest['source'],
  destination: TransferRequest['destination'],
  conflictResolution: string,
  onProgress: (loaded: number) => void,
): Promise<void> {
  // Parse source and destination paths
  const [sourceType, sourceLoc, sourcePath] = parseTransferPath(fileJob.sourcePath);
  const [destType, destLoc, destPath] = parseTransferPath(fileJob.destinationPath);

  // Handle conflict resolution
  let finalDestPath = destPath;
  if (conflictResolution === 'skip') {
    const exists = await checkExists(destType, destLoc, destPath);
    if (exists) {
      // Skip this file - mark as completed
      fileJob.size = 0;
      return;
    }
  } else if (conflictResolution === 'rename') {
    finalDestPath = await findNonConflictingName(destType, destLoc, destPath);
  }
  // 'overwrite' - just proceed with original path

  // Execute transfer based on source/destination types
  if (sourceType === 's3' && destType === 'local') {
    await transferS3ToLocal(sourceLoc, sourcePath, destLoc, finalDestPath, fileJob, onProgress);
  } else if (sourceType === 'local' && destType === 's3') {
    await transferLocalToS3(sourceLoc, sourcePath, destLoc, finalDestPath, fileJob, onProgress);
  } else if (sourceType === 'local' && destType === 'local') {
    await transferLocalToLocal(sourceLoc, sourcePath, destLoc, finalDestPath, fileJob, onProgress);
  } else if (sourceType === 's3' && destType === 's3') {
    await transferS3ToS3(sourceLoc, sourcePath, destLoc, finalDestPath, fileJob, onProgress);
  } else {
    throw new Error(`Unsupported transfer combination: ${sourceType} → ${destType}`);
  }
}

/**
 * Transfer routes plugin
 */
export default async (fastify: FastifyInstance): Promise<void> => {
  /**
   * POST /
   * Initiate cross-storage transfer
   */
  fastify.post<{ Body: TransferRequest }>('/', async (request, reply) => {
    const { source, destination, files, conflictResolution } = request.body;

    try {
      // Validate request
      if (!source || !destination || !files || !conflictResolution) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      if (files.length === 0) {
        return reply.code(400).send({ error: 'No files specified' });
      }

      // Create transfer jobs array
      const transferJobs = files.map((file) => ({
        sourcePath: `${source.type}:${source.locationId}/${path.join(source.path, file)}`,
        destinationPath: `${destination.type}:${destination.locationId}/${path.join(
          destination.path,
          file,
        )}`,
        size: 0, // Will be determined during transfer
      }));

      // Queue job
      const jobId = transferQueue.queueJob(
        'cross-storage',
        transferJobs,
        async (fileJob, onProgress) => {
          await executeTransfer(fileJob, source, destination, conflictResolution, onProgress);
        },
      );

      return reply.code(200).send({
        jobId,
        sseUrl: `/progress/${jobId}`,
      });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Transfer failed' });
    }
  });

  /**
   * GET /progress/:jobId
   * SSE endpoint for real-time progress updates
   */
  fastify.get<{ Params: { jobId: string } }>('/progress/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Get initial job state
    const job = transferQueue.getJob(jobId);
    if (!job) {
      sendEvent({ error: 'Job not found' });
      reply.raw.end();
      return;
    }

    // Send initial state
    sendEvent({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      files: job.files.map((f) => ({
        file: f.destinationPath,
        loaded: f.loaded,
        total: f.size,
        status: f.status,
        error: f.error,
      })),
    });

    // Listen for job updates
    const updateListener = (updatedJob: TransferJob) => {
      if (updatedJob.id === jobId) {
        sendEvent({
          jobId: updatedJob.id,
          status: updatedJob.status,
          progress: updatedJob.progress,
          files: updatedJob.files.map((f) => ({
            file: f.destinationPath,
            loaded: f.loaded,
            total: f.size,
            status: f.status,
            error: f.error,
          })),
        });

        // Close stream when job complete
        if (
          updatedJob.status === 'completed' ||
          updatedJob.status === 'failed' ||
          updatedJob.status === 'cancelled'
        ) {
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

  /**
   * DELETE /:jobId
   * Cancel transfer
   */
  fastify.delete<{ Params: { jobId: string } }>('/:jobId', async (request, reply) => {
    const { jobId } = request.params;

    try {
      const cancelled = transferQueue.cancelJob(jobId);
      return reply.code(200).send({ cancelled });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Cancel failed' });
    }
  });

  /**
   * POST /check-conflicts
   * Pre-flight conflict check
   */
  fastify.post<{ Body: ConflictCheckRequest }>('/check-conflicts', async (request, reply) => {
    const { destination, files } = request.body;

    try {
      // Validate request
      if (!destination || !files) {
        return reply.code(400).send({ error: 'Missing required fields' });
      }

      const conflicts: string[] = [];

      for (const file of files) {
        const destPath = path.join(destination.path, file);

        try {
          if (destination.type === 'local') {
            const absolutePath = await validatePath(destination.locationId, destPath);
            await fs.access(absolutePath);
            conflicts.push(file);
          } else if (destination.type === 's3') {
            const { s3Client } = getS3Config();
            const command = new HeadObjectCommand({
              Bucket: destination.locationId,
              Key: destPath,
            });
            await s3Client.send(command);
            conflicts.push(file);
          }
        } catch {
          // File doesn't exist, no conflict
        }
      }

      return reply.code(200).send({ conflicts });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: error.message || 'Conflict check failed' });
    }
  });
};
