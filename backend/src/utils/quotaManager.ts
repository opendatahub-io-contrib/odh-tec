interface Quota {
  maxStorageBytes: number;
  maxFileCount: number;
  currentStorageBytes: number;
  currentFileCount: number;
}

// In-memory quota store (use database in production)
const quotaStore = new Map<string, Quota>();

// Default quota limits
const DEFAULT_MAX_STORAGE_BYTES = 100 * 1024 * 1024 * 1024; // 100 GB
const DEFAULT_MAX_FILE_COUNT = 10000;

/**
 * Initialize quota for a storage location
 */
export function initializeQuota(locationId: string): void {
  if (!quotaStore.has(locationId)) {
    quotaStore.set(locationId, {
      maxStorageBytes: DEFAULT_MAX_STORAGE_BYTES,
      maxFileCount: DEFAULT_MAX_FILE_COUNT,
      currentStorageBytes: 0,
      currentFileCount: 0,
    });
  }
}

/**
 * Check if operation would exceed quota
 */
export function checkQuota(
  locationId: string,
  additionalBytes: number,
  additionalFiles: number,
): { allowed: boolean; reason?: string } {
  initializeQuota(locationId);
  const quota = quotaStore.get(locationId)!;

  if (quota.currentStorageBytes + additionalBytes > quota.maxStorageBytes) {
    const remaining = quota.maxStorageBytes - quota.currentStorageBytes;
    return {
      allowed: false,
      reason: `Storage quota exceeded. ${formatBytes(remaining)} remaining.`,
    };
  }

  if (quota.currentFileCount + additionalFiles > quota.maxFileCount) {
    const remaining = quota.maxFileCount - quota.currentFileCount;
    return {
      allowed: false,
      reason: `File count quota exceeded. ${remaining} files remaining.`,
    };
  }

  return { allowed: true };
}

/**
 * Update quota after successful operation
 */
export function updateQuota(locationId: string, bytesChange: number, filesChange: number): void {
  initializeQuota(locationId);
  const quota = quotaStore.get(locationId)!;

  quota.currentStorageBytes += bytesChange;
  quota.currentFileCount += filesChange;

  // Prevent negative values
  if (quota.currentStorageBytes < 0) quota.currentStorageBytes = 0;
  if (quota.currentFileCount < 0) quota.currentFileCount = 0;
}

/**
 * Get current quota status
 */
export function getQuotaStatus(locationId: string): Quota {
  initializeQuota(locationId);
  return { ...quotaStore.get(locationId)! };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
