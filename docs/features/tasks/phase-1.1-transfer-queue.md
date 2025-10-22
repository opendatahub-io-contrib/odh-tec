# Phase 1.1: Shared Transfer Queue Module

> **Task ID**: phase-1.1
> **Estimated Effort**: 1-1.5 days
> **Dependencies**: Phase 0 (Test Infrastructure)

## Objective

Create a centralized transfer queue module that coordinates all file transfer operations (S3 uploads/downloads, local uploads, cross-storage transfers, and HuggingFace imports) with shared concurrency limits. This module will use `p-limit` to prevent memory spikes during concurrent operations.

## Prerequisites

- Phase 0 completed (test infrastructure available)
- `p-limit` package installed: `npm install p-limit`
- `@types/p-limit` installed as devDependency

## Files to Create

- `backend/src/utils/transferQueue.ts` - Main transfer queue implementation
- `backend/src/__tests__/utils/transferQueue.test.ts` - Unit tests

## Implementation Steps

### Step 1: Define Transfer Queue Types

Create `backend/src/utils/transferQueue.ts` with type definitions:

```typescript
import pLimit from 'p-limit';
import { EventEmitter } from 'events';

/**
 * Transfer job status
 */
export type TransferStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Transfer file job status
 */
export type TransferFileStatus = 'queued' | 'transferring' | 'completed' | 'error';

/**
 * Transfer operation types
 */
export type TransferType =
  | 's3-upload'
  | 's3-download'
  | 'local-upload'
  | 'cross-storage'
  | 'huggingface';

/**
 * Individual file transfer within a job
 */
export interface TransferFileJob {
  sourcePath: string;
  destinationPath: string;
  size: number;
  loaded: number;
  status: TransferFileStatus;
  error?: string;
}

/**
 * Overall job progress
 */
export interface TransferProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  loadedBytes: number;
  percentage: number;
}

/**
 * Complete transfer job
 */
export interface TransferJob {
  id: string;
  type: TransferType;
  status: TransferStatus;
  files: TransferFileJob[];
  progress: TransferProgress;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Transfer executor function signature
 */
export type TransferExecutor = (
  file: TransferFileJob,
  onProgress: (loaded: number) => void,
) => Promise<void>;
```

### Step 2: Implement Transfer Queue Class

Continue in `backend/src/utils/transferQueue.ts`:

```typescript
/**
 * Centralized transfer queue for managing all file transfer operations
 * with shared concurrency limits
 */
export class TransferQueue extends EventEmitter {
  private limiter: ReturnType<typeof pLimit>;
  private jobs: Map<string, TransferJob>;
  private activeTransfers: Set<string>;
  private nextJobId: number;

  constructor(concurrencyLimit: number) {
    super();
    this.limiter = pLimit(concurrencyLimit);
    this.jobs = new Map();
    this.activeTransfers = new Set();
    this.nextJobId = 1;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `transfer-${Date.now()}-${this.nextJobId++}`;
  }

  /**
   * Calculate overall job progress
   */
  private calculateProgress(files: TransferFileJob[]): TransferProgress {
    const totalFiles = files.length;
    const completedFiles = files.filter((f) => f.status === 'completed').length;
    const failedFiles = files.filter((f) => f.status === 'error').length;
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const loadedBytes = files.reduce((sum, f) => sum + f.loaded, 0);
    const percentage = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

    return {
      totalFiles,
      completedFiles,
      failedFiles,
      totalBytes,
      loadedBytes,
      percentage,
    };
  }

  /**
   * Update job status and emit event
   */
  private updateJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.progress = this.calculateProgress(job.files);

    // Update overall job status
    if (job.files.every((f) => f.status === 'completed')) {
      job.status = 'completed';
      job.completedAt = new Date();
      this.activeTransfers.delete(jobId);
    } else if (
      job.files.some((f) => f.status === 'error') &&
      job.files.every((f) => f.status === 'completed' || f.status === 'error')
    ) {
      job.status = 'failed';
      job.completedAt = new Date();
      this.activeTransfers.delete(jobId);
    } else if (job.files.some((f) => f.status === 'transferring')) {
      job.status = 'active';
      if (!job.startedAt) {
        job.startedAt = new Date();
      }
    }

    this.emit('job-updated', job);
  }

  /**
   * Queue a new transfer job
   *
   * @param type - Transfer operation type
   * @param files - Array of files to transfer
   * @param executor - Function to execute each file transfer
   * @returns Job ID
   */
  queueJob(
    type: TransferType,
    files: Omit<TransferFileJob, 'loaded' | 'status'>[],
    executor: TransferExecutor,
  ): string {
    const jobId = this.generateJobId();

    const job: TransferJob = {
      id: jobId,
      type,
      status: 'queued',
      files: files.map((f) => ({
        ...f,
        loaded: 0,
        status: 'queued' as TransferFileStatus,
      })),
      progress: this.calculateProgress([]),
      createdAt: new Date(),
    };

    this.jobs.set(jobId, job);
    this.activeTransfers.add(jobId);
    this.emit('job-created', job);

    // Start processing files
    this.processFiles(jobId, executor);

    return jobId;
  }

  /**
   * Process all files in a job with concurrency control
   */
  private async processFiles(jobId: string, executor: TransferExecutor): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Process each file with concurrency limit
    const promises = job.files.map((file, index) =>
      this.limiter(async () => {
        // Check if job was cancelled
        if (job.status === 'cancelled') {
          file.status = 'error';
          file.error = 'Job cancelled';
          return;
        }

        try {
          file.status = 'transferring';
          this.updateJob(jobId);

          // Execute transfer with progress callback
          await executor(file, (loaded: number) => {
            file.loaded = loaded;
            this.updateJob(jobId);
          });

          file.status = 'completed';
          file.loaded = file.size;
        } catch (error: any) {
          file.status = 'error';
          file.error = error.message || 'Transfer failed';
        }

        this.updateJob(jobId);
      }),
    );

    await Promise.all(promises);
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): TransferJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel an active job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = 'cancelled';
    job.completedAt = new Date();
    this.activeTransfers.delete(jobId);

    // Mark all non-completed files as cancelled
    job.files.forEach((file) => {
      if (file.status !== 'completed') {
        file.status = 'error';
        file.error = 'Cancelled by user';
      }
    });

    this.updateJob(jobId);
    return true;
  }

  /**
   * Get all active job IDs
   */
  getActiveJobIds(): string[] {
    return Array.from(this.activeTransfers);
  }

  /**
   * Get all jobs (for debugging)
   */
  getAllJobs(): TransferJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Clean up old completed jobs (optional, for memory management)
   */
  cleanupOldJobs(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
        job.completedAt &&
        now - job.completedAt.getTime() > maxAge
      ) {
        this.jobs.delete(jobId);
      }
    }
  }

  /**
   * Update concurrency limit (useful for runtime configuration changes)
   */
  updateConcurrencyLimit(newLimit: number): void {
    this.limiter = pLimit(newLimit);
  }
}
```

### Step 3: Export Singleton Instance

Add to `backend/src/utils/transferQueue.ts`:

```typescript
import { getMaxConcurrentTransfers } from './config';

/**
 * Global singleton transfer queue instance
 * Shared across all transfer operations
 */
export const transferQueue = new TransferQueue(getMaxConcurrentTransfers());

// Update concurrency when config changes
export function updateTransferQueueConcurrency(newLimit: number): void {
  transferQueue.updateConcurrencyLimit(newLimit);
}
```

### Step 4: Create Unit Tests

Create `backend/src/__tests__/utils/transferQueue.test.ts`:

```typescript
import { TransferQueue, TransferFileJob } from '../../utils/transferQueue';

describe('TransferQueue', () => {
  let queue: TransferQueue;

  beforeEach(() => {
    queue = new TransferQueue(2);
  });

  it('should create a new job', () => {
    const files = [{ sourcePath: 'source1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    const executor = jest.fn().mockResolvedValue(undefined);
    const jobId = queue.queueJob('local-upload', files, executor);

    expect(jobId).toMatch(/^transfer-/);
    const job = queue.getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.files.length).toBe(1);
  });

  it('should process files with concurrency limit', async () => {
    const files = [
      { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
      { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
      { sourcePath: 'file3.txt', destinationPath: 'dest3.txt', size: 512 },
    ];

    let activeCount = 0;
    let maxActive = 0;

    const executor = jest.fn(async (file: TransferFileJob, onProgress) => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);

      // Simulate transfer with progress
      onProgress(file.size / 2);
      await new Promise((resolve) => setTimeout(resolve, 50));
      onProgress(file.size);

      activeCount--;
    });

    const jobId = queue.queueJob('cross-storage', files, executor);

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(maxActive).toBeLessThanOrEqual(2); // Concurrency limit
    expect(executor).toHaveBeenCalledTimes(3);

    const job = queue.getJob(jobId);
    expect(job?.status).toBe('completed');
    expect(job?.progress.completedFiles).toBe(3);
    expect(job?.progress.percentage).toBe(100);
  });

  it('should handle transfer errors', async () => {
    const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    const executor = jest.fn().mockRejectedValue(new Error('Transfer failed'));
    const jobId = queue.queueJob('s3-upload', files, executor);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const job = queue.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.files[0].status).toBe('error');
    expect(job?.files[0].error).toBe('Transfer failed');
  });

  it('should cancel active job', async () => {
    const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    const executor = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    const jobId = queue.queueJob('s3-download', files, executor);

    // Cancel immediately
    const cancelled = queue.cancelJob(jobId);
    expect(cancelled).toBe(true);

    const job = queue.getJob(jobId);
    expect(job?.status).toBe('cancelled');
  });

  it('should emit job-created and job-updated events', (done) => {
    const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    let createdEmitted = false;
    let updatedEmitted = false;

    queue.on('job-created', (job) => {
      createdEmitted = true;
      expect(job.id).toMatch(/^transfer-/);
    });

    queue.on('job-updated', (job) => {
      updatedEmitted = true;
      if (job.status === 'completed') {
        expect(createdEmitted).toBe(true);
        expect(updatedEmitted).toBe(true);
        done();
      }
    });

    const executor = jest.fn().mockResolvedValue(undefined);
    queue.queueJob('local-upload', files, executor);
  });

  it('should calculate progress correctly', async () => {
    const files = [
      { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1000 },
      { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2000 },
    ];

    const executor = jest.fn(async (file, onProgress) => {
      onProgress(file.size / 2);
      await new Promise((resolve) => setTimeout(resolve, 50));
      onProgress(file.size);
    });

    const jobId = queue.queueJob('cross-storage', files, executor);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const job = queue.getJob(jobId);
    expect(job?.progress.totalFiles).toBe(2);
    expect(job?.progress.totalBytes).toBe(3000);
    expect(job?.progress.loadedBytes).toBe(3000);
    expect(job?.progress.percentage).toBe(100);
  });

  it('should track active job IDs', () => {
    const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    const executor = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });

    const jobId1 = queue.queueJob('s3-upload', files, executor);
    const jobId2 = queue.queueJob('s3-download', files, executor);

    const activeIds = queue.getActiveJobIds();
    expect(activeIds).toContain(jobId1);
    expect(activeIds).toContain(jobId2);
  });

  it('should cleanup old completed jobs', async () => {
    const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

    const executor = jest.fn().mockResolvedValue(undefined);
    const jobId = queue.queueJob('local-upload', files, executor);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(queue.getJob(jobId)).toBeDefined();

    // Cleanup jobs older than 0ms (all jobs)
    queue.cleanupOldJobs(0);

    expect(queue.getJob(jobId)).toBeUndefined();
  });
});
```

### Step 5: Integration with Config

Ensure `backend/src/utils/config.ts` exports the concurrency getter:

```typescript
// Should already exist or be added in Phase 1.2
export function getMaxConcurrentTransfers(): number {
  return parseInt(process.env.MAX_CONCURRENT_TRANSFERS || '2', 10);
}
```

## Acceptance Criteria

- [ ] TransferQueue class implemented with all required methods
- [ ] Job creation returns unique job IDs
- [ ] Concurrency limit enforced (max N concurrent transfers)
- [ ] Progress tracking works correctly (bytes and percentage)
- [ ] Error handling captures and reports transfer failures
- [ ] Job cancellation works and updates status
- [ ] Events emitted for job creation and updates
- [ ] Singleton instance exported for global use
- [ ] Unit tests pass with >80% coverage
- [ ] TypeScript types are fully defined

## Testing Requirements

Run tests:

```bash
cd backend
npm test -- transferQueue.test.ts
```

Expected results:

- All tests pass
- Coverage >80% for transferQueue.ts
- No memory leaks (jobs can be cleaned up)

## Notes

- The transfer queue is the foundation for all transfer operations
- Concurrency limit prevents memory spikes during large transfers
- EventEmitter pattern allows SSE endpoints to listen for updates
- Job cleanup prevents unbounded memory growth
- This module will be used by:
  - Phase 1.4 (local storage routes)
  - Phase 1.5 (cross-storage transfer routes)
  - Phase 1.6 (HuggingFace integration)

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 82-122)
- p-limit documentation: https://github.com/sindresorhus/p-limit
- Node.js EventEmitter: https://nodejs.org/api/events.html
