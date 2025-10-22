import pLimit from 'p-limit';
import { EventEmitter } from 'events';
import { getMaxConcurrentTransfers } from './config';

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

    // Don't update status if job is already cancelled
    if (job.status === 'cancelled') {
      this.emit('job-updated', job);
      return;
    }

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
    const promises = job.files.map((file) =>
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
  cleanupOldJobs(maxAge = 3600000): void {
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

/**
 * Global singleton transfer queue instance
 * Shared across all transfer operations
 */
export const transferQueue = new TransferQueue(getMaxConcurrentTransfers());

/**
 * Update concurrency when config changes
 */
export function updateTransferQueueConcurrency(newLimit: number): void {
  transferQueue.updateConcurrencyLimit(newLimit);
}
