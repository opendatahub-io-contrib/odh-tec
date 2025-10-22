import { TransferQueue, TransferFileJob } from '../../utils/transferQueue';

describe('TransferQueue', () => {
  let queue: TransferQueue;

  beforeEach(() => {
    queue = new TransferQueue(2);
  });

  afterEach(() => {
    // Clean up event listeners
    queue.removeAllListeners();
  });

  describe('Job Creation', () => {
    it('should create a new job with unique ID', () => {
      const files = [{ sourcePath: 'source1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockResolvedValue(undefined);
      const jobId = queue.queueJob('local-upload', files, executor);

      expect(jobId).toMatch(/^transfer-\d+-\d+$/);
      const job = queue.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.files.length).toBe(1);
      expect(job?.status).toBe('queued');
      expect(job?.type).toBe('local-upload');
    });

    it('should generate unique job IDs for multiple jobs', () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];
      const executor = jest.fn().mockResolvedValue(undefined);

      const jobId1 = queue.queueJob('s3-upload', files, executor);
      const jobId2 = queue.queueJob('s3-download', files, executor);
      const jobId3 = queue.queueJob('cross-storage', files, executor);

      expect(jobId1).not.toBe(jobId2);
      expect(jobId2).not.toBe(jobId3);
      expect(jobId1).not.toBe(jobId3);
    });

    it('should initialize files with queued status and zero loaded bytes', () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
      ];

      const executor = jest.fn().mockResolvedValue(undefined);
      const jobId = queue.queueJob('s3-upload', files, executor);

      const job = queue.getJob(jobId);
      expect(job?.files).toHaveLength(2);
      job?.files.forEach((file) => {
        expect(file.status).toBe('queued');
        expect(file.loaded).toBe(0);
      });
    });
  });

  describe('Concurrency Control', () => {
    it('should process files with concurrency limit of 2', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
        { sourcePath: 'file3.txt', destinationPath: 'dest3.txt', size: 512 },
        { sourcePath: 'file4.txt', destinationPath: 'dest4.txt', size: 256 },
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
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(maxActive).toBeLessThanOrEqual(2); // Concurrency limit
      expect(executor).toHaveBeenCalledTimes(4);

      const job = queue.getJob(jobId);
      expect(job?.status).toBe('completed');
      expect(job?.progress.completedFiles).toBe(4);
    });

    it('should update concurrency limit dynamically', async () => {
      // Start with limit of 2
      const files = Array.from({ length: 6 }, (_, i) => ({
        sourcePath: `file${i}.txt`,
        destinationPath: `dest${i}.txt`,
        size: 1024,
      }));

      let activeCount = 0;
      let maxActive = 0;

      const executor = jest.fn(async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 50));
        activeCount--;
      });

      const jobId = queue.queueJob('s3-upload', files, executor);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update limit to 4
      queue.updateConcurrencyLimit(4);

      const files2 = Array.from({ length: 6 }, (_, i) => ({
        sourcePath: `file${i + 6}.txt`,
        destinationPath: `dest${i + 6}.txt`,
        size: 1024,
      }));

      maxActive = 0; // Reset counter
      const jobId2 = queue.queueJob('s3-upload', files2, executor);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second batch should have higher concurrency
      expect(maxActive).toBeGreaterThan(2);
    });
  });

  describe('Progress Tracking', () => {
    it('should calculate progress correctly with bytes and percentage', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1000 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2000 },
        { sourcePath: 'file3.txt', destinationPath: 'dest3.txt', size: 3000 },
      ];

      const executor = jest.fn(async (file, onProgress) => {
        onProgress(file.size / 2);
        await new Promise((resolve) => setTimeout(resolve, 50));
        onProgress(file.size);
      });

      const jobId = queue.queueJob('cross-storage', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const job = queue.getJob(jobId);
      expect(job?.progress.totalFiles).toBe(3);
      expect(job?.progress.totalBytes).toBe(6000);
      expect(job?.progress.loadedBytes).toBe(6000);
      expect(job?.progress.percentage).toBe(100);
      expect(job?.progress.completedFiles).toBe(3);
      expect(job?.progress.failedFiles).toBe(0);
    });

    it('should handle zero-byte files correctly', async () => {
      const files = [{ sourcePath: 'empty.txt', destinationPath: 'dest.txt', size: 0 }];

      const executor = jest.fn().mockResolvedValue(undefined);
      const jobId = queue.queueJob('local-upload', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const job = queue.getJob(jobId);
      expect(job?.progress.totalBytes).toBe(0);
      expect(job?.progress.percentage).toBe(0);
      expect(job?.status).toBe('completed');
    });

    it('should track partial progress during transfer', (done) => {
      const files = [{ sourcePath: 'large.bin', destinationPath: 'dest.bin', size: 10000 }];

      let progressUpdates: number[] = [];

      queue.on('job-updated', (job) => {
        progressUpdates.push(job.progress.percentage);
        if (job.status === 'completed') {
          expect(progressUpdates.length).toBeGreaterThan(1);
          expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
          done();
        }
      });

      const executor = jest.fn(async (file, onProgress) => {
        onProgress(2500);
        await new Promise((resolve) => setTimeout(resolve, 20));
        onProgress(5000);
        await new Promise((resolve) => setTimeout(resolve, 20));
        onProgress(7500);
        await new Promise((resolve) => setTimeout(resolve, 20));
        onProgress(10000);
      });

      queue.queueJob('huggingface', files, executor);
    });
  });

  describe('Error Handling', () => {
    it('should handle transfer errors and mark job as failed', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockRejectedValue(new Error('Network timeout'));
      const jobId = queue.queueJob('s3-upload', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const job = queue.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.files[0].status).toBe('error');
      expect(job?.files[0].error).toBe('Network timeout');
      expect(job?.progress.failedFiles).toBe(1);
    });

    it('should handle partial failures with multiple files', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
        { sourcePath: 'file3.txt', destinationPath: 'dest3.txt', size: 512 },
      ];

      const executor = jest.fn(async (file: TransferFileJob) => {
        if (file.sourcePath === 'file2.txt') {
          throw new Error('File not found');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const jobId = queue.queueJob('cross-storage', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const job = queue.getJob(jobId);
      expect(job?.status).toBe('failed');
      expect(job?.progress.completedFiles).toBe(2);
      expect(job?.progress.failedFiles).toBe(1);

      const failedFile = job?.files.find((f) => f.sourcePath === 'file2.txt');
      expect(failedFile?.status).toBe('error');
      expect(failedFile?.error).toBe('File not found');
    });

    it('should capture error message when error has no message property', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockRejectedValue('String error');
      const jobId = queue.queueJob('s3-download', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const job = queue.getJob(jobId);
      expect(job?.files[0].error).toBe('Transfer failed');
    });
  });

  describe('Job Cancellation', () => {
    it('should cancel active job and update status', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
      ];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      const jobId = queue.queueJob('s3-download', files, executor);

      // Wait a bit for processing to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Cancel job
      const cancelled = queue.cancelJob(jobId);
      expect(cancelled).toBe(true);

      const job = queue.getJob(jobId);
      expect(job?.status).toBe('cancelled');
      expect(job?.completedAt).toBeDefined();
    });

    it('should mark non-completed files as cancelled', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
      ];

      let firstFileCompleted = false;

      const executor = jest.fn(async (file: TransferFileJob) => {
        if (file.sourcePath === 'file1.txt') {
          await new Promise((resolve) => setTimeout(resolve, 50));
          firstFileCompleted = true;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      });

      const jobId = queue.queueJob('local-upload', files, executor);

      // Wait for first file to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(firstFileCompleted).toBe(true);

      // Cancel job
      queue.cancelJob(jobId);

      const job = queue.getJob(jobId);
      const completedFile = job?.files.find((f) => f.sourcePath === 'file1.txt');
      const cancelledFile = job?.files.find((f) => f.sourcePath === 'file2.txt');

      expect(completedFile?.status).toBe('completed');
      expect(cancelledFile?.status).toBe('error');
      expect(cancelledFile?.error).toBe('Cancelled by user');
    });

    it('should return false when cancelling non-existent job', () => {
      const cancelled = queue.cancelJob('non-existent-job-id');
      expect(cancelled).toBe(false);
    });

    it('should prevent further processing after cancellation', async () => {
      const files = [
        { sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 },
        { sourcePath: 'file2.txt', destinationPath: 'dest2.txt', size: 2048 },
        { sourcePath: 'file3.txt', destinationPath: 'dest3.txt', size: 512 },
      ];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const jobId = queue.queueJob('cross-storage', files, executor);

      // Cancel immediately
      queue.cancelJob(jobId);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const job = queue.getJob(jobId);
      expect(job?.status).toBe('cancelled');

      // Files should be marked as cancelled, not completed
      job?.files.forEach((file) => {
        if (file.status !== 'completed') {
          expect(file.error).toMatch(/cancelled/i);
        }
      });
    });
  });

  describe('Event Emission', () => {
    it('should emit job-created event when job is queued', (done) => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      queue.on('job-created', (job) => {
        expect(job.id).toMatch(/^transfer-/);
        expect(job.status).toBe('queued');
        expect(job.type).toBe('local-upload');
        done();
      });

      const executor = jest.fn().mockResolvedValue(undefined);
      queue.queueJob('local-upload', files, executor);
    });

    it('should emit job-updated events during processing', (done) => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      let updateCount = 0;
      const statuses: string[] = [];

      queue.on('job-updated', (job) => {
        updateCount++;
        statuses.push(job.status);

        if (job.status === 'completed') {
          expect(updateCount).toBeGreaterThan(1);
          expect(statuses).toContain('active');
          done();
        }
      });

      const executor = jest.fn(async (file, onProgress) => {
        onProgress(file.size / 2);
        await new Promise((resolve) => setTimeout(resolve, 50));
        onProgress(file.size);
      });

      queue.queueJob('s3-upload', files, executor);
    });

    it('should emit both job-created and job-updated events', (done) => {
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
  });

  describe('Active Job Tracking', () => {
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
      expect(activeIds).toHaveLength(2);
    });

    it('should remove job from active list when completed', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockResolvedValue(undefined);
      const jobId = queue.queueJob('local-upload', files, executor);

      expect(queue.getActiveJobIds()).toContain(jobId);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queue.getActiveJobIds()).not.toContain(jobId);
    });

    it('should remove job from active list when failed', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockRejectedValue(new Error('Failed'));
      const jobId = queue.queueJob('s3-upload', files, executor);

      expect(queue.getActiveJobIds()).toContain(jobId);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queue.getActiveJobIds()).not.toContain(jobId);
    });

    it('should remove job from active list when cancelled', () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      const jobId = queue.queueJob('cross-storage', files, executor);
      expect(queue.getActiveJobIds()).toContain(jobId);

      queue.cancelJob(jobId);
      expect(queue.getActiveJobIds()).not.toContain(jobId);
    });
  });

  describe('Job Cleanup', () => {
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

    it('should not cleanup active jobs', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      const jobId = queue.queueJob('s3-upload', files, executor);

      queue.cleanupOldJobs(0);

      expect(queue.getJob(jobId)).toBeDefined();
    });

    it('should cleanup failed jobs', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockRejectedValue(new Error('Failed'));
      const jobId = queue.queueJob('s3-download', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queue.getJob(jobId)).toBeDefined();

      queue.cleanupOldJobs(0);

      expect(queue.getJob(jobId)).toBeUndefined();
    });

    it('should cleanup cancelled jobs', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      const jobId = queue.queueJob('cross-storage', files, executor);

      // Give it a moment to start processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      queue.cancelJob(jobId);

      expect(queue.getJob(jobId)).toBeDefined();
      expect(queue.getJob(jobId)?.status).toBe('cancelled');

      // Wait a bit to ensure completedAt timestamp is in the past
      await new Promise((resolve) => setTimeout(resolve, 10));

      queue.cleanupOldJobs(0);

      expect(queue.getJob(jobId)).toBeUndefined();
    });

    it('should respect maxAge parameter', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn().mockResolvedValue(undefined);
      const jobId = queue.queueJob('local-upload', files, executor);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cleanup jobs older than 1 hour (should not delete recent job)
      queue.cleanupOldJobs(3600000);

      expect(queue.getJob(jobId)).toBeDefined();
    });
  });

  describe('Get All Jobs', () => {
    it('should return all jobs', () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      });

      queue.queueJob('s3-upload', files, executor);
      queue.queueJob('s3-download', files, executor);
      queue.queueJob('local-upload', files, executor);

      const allJobs = queue.getAllJobs();
      expect(allJobs).toHaveLength(3);
      expect(allJobs.map((j) => j.type)).toEqual(['s3-upload', 's3-download', 'local-upload']);
    });

    it('should return empty array when no jobs exist', () => {
      const allJobs = queue.getAllJobs();
      expect(allJobs).toEqual([]);
    });
  });

  describe('Job Status Transitions', () => {
    it('should transition from queued to active to completed', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const statuses: string[] = [];

      queue.on('job-updated', (job) => {
        statuses.push(job.status);
      });

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const jobId = queue.queueJob('huggingface', files, executor);

      const initialJob = queue.getJob(jobId);
      expect(initialJob?.status).toBe('queued');

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(statuses).toContain('active');
      expect(statuses).toContain('completed');
    });

    it('should set startedAt when transitioning to active', async () => {
      const files = [{ sourcePath: 'file1.txt', destinationPath: 'dest1.txt', size: 1024 }];

      const executor = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const jobId = queue.queueJob('s3-upload', files, executor);

      const initialJob = queue.getJob(jobId);
      expect(initialJob?.startedAt).toBeUndefined();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const completedJob = queue.getJob(jobId);
      expect(completedJob?.startedAt).toBeDefined();
      expect(completedJob?.completedAt).toBeDefined();
    });
  });
});
