# Phase 1.2: Configuration Updates

> **Task ID**: phase-1.2
> **Estimated Effort**: 0.5 days
> **Dependencies**: None (can be done in parallel with Phase 1.1)

## Objective

Extend the backend configuration system to support local storage paths and file size limits. Add environment variable parsing, validation, and runtime update capabilities for `LOCAL_STORAGE_PATHS` and `MAX_FILE_SIZE_GB`.

## Prerequisites

- Existing `backend/src/utils/config.ts` file (should already exist for S3 configuration)

## Files to Modify

- `backend/src/utils/config.ts` - Add local storage configuration
- `backend/.env.example` - Document new environment variables
- `backend/src/__tests__/utils/config.test.ts` - Add configuration tests

## Implementation Steps

### Step 1: Read Existing Config

First, check the existing `backend/src/utils/config.ts` to understand the current structure:

```bash
# Read the existing config file to see current patterns
cat backend/src/utils/config.ts
```

### Step 2: Add Local Storage Configuration

Add to `backend/src/utils/config.ts`:

```typescript
/**
 * Local Storage Configuration
 */

// Parse LOCAL_STORAGE_PATHS from environment
// Default: single directory at /opt/app-root/src/data
let localStoragePaths: string[] = process.env.LOCAL_STORAGE_PATHS
  ? process.env.LOCAL_STORAGE_PATHS.split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  : ['/opt/app-root/src/data'];

// Parse MAX_FILE_SIZE_GB from environment
// Default: 20GB
let maxFileSizeGB: number = parseInt(process.env.MAX_FILE_SIZE_GB || '20', 10);

// Validate maxFileSizeGB
if (isNaN(maxFileSizeGB) || maxFileSizeGB <= 0) {
  console.warn(`Invalid MAX_FILE_SIZE_GB: ${process.env.MAX_FILE_SIZE_GB}, using default: 20`);
  maxFileSizeGB = 20;
}

/**
 * Get configured local storage paths
 * @returns Array of filesystem paths that can be used for local storage
 */
export function getLocalStoragePaths(): string[] {
  return [...localStoragePaths]; // Return copy to prevent mutation
}

/**
 * Get maximum file size limit in GB
 * @returns Maximum file size in gigabytes
 */
export function getMaxFileSizeGB(): number {
  return maxFileSizeGB;
}

/**
 * Get maximum file size limit in bytes
 * @returns Maximum file size in bytes
 */
export function getMaxFileSizeBytes(): number {
  return maxFileSizeGB * 1024 * 1024 * 1024;
}

/**
 * Update local storage paths at runtime (for testing or runtime configuration)
 * @param newPaths - Array of filesystem paths
 */
export function updateLocalStoragePaths(newPaths: string[]): void {
  localStoragePaths = newPaths.filter((p) => p.trim().length > 0);
}

/**
 * Update maximum file size limit at runtime
 * @param newLimitGB - New limit in gigabytes
 */
export function updateMaxFileSizeGB(newLimitGB: number): void {
  if (newLimitGB > 0 && !isNaN(newLimitGB)) {
    maxFileSizeGB = newLimitGB;
  } else {
    throw new Error(`Invalid file size limit: ${newLimitGB}`);
  }
}

/**
 * Validate a file size against the configured limit
 * @param sizeBytes - File size in bytes
 * @returns true if file size is within limit
 */
export function isFileSizeValid(sizeBytes: number): boolean {
  return sizeBytes <= getMaxFileSizeBytes();
}

/**
 * Format file size for error messages
 * @param sizeBytes - File size in bytes
 * @returns Formatted string (e.g., "25.5 GB")
 */
export function formatFileSize(sizeBytes: number): string {
  const gb = sizeBytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = sizeBytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = sizeBytes / 1024;
  return `${kb.toFixed(2)} KB`;
}
```

### Step 3: Update Existing MAX_CONCURRENT_TRANSFERS

Ensure the existing transfer concurrency configuration is exported (if not already):

```typescript
/**
 * Get maximum concurrent transfer limit
 * @returns Number of concurrent transfers allowed
 */
export function getMaxConcurrentTransfers(): number {
  const limit = parseInt(process.env.MAX_CONCURRENT_TRANSFERS || '2', 10);
  return isNaN(limit) || limit <= 0 ? 2 : limit;
}
```

### Step 4: Update .env.example

Add to `backend/.env.example`:

```bash
# ===================================
# Local Storage Configuration
# ===================================

# Comma-separated list of allowed local storage paths
# These paths must exist and be accessible to the application
# Default: /opt/app-root/src/data
LOCAL_STORAGE_PATHS=/opt/app-root/src/data,/opt/app-root/src/models

# Maximum file size for uploads and transfers (in GB)
# Files larger than this limit will be rejected
# Default: 20
MAX_FILE_SIZE_GB=20

# ===================================
# Transfer Configuration
# ===================================

# Maximum number of concurrent file transfers
# Higher values increase throughput but use more memory
# Default: 2
MAX_CONCURRENT_TRANSFERS=2
```

### Step 5: Create Configuration Tests

Create `backend/src/__tests__/utils/config.test.ts`:

```typescript
import {
  getLocalStoragePaths,
  getMaxFileSizeGB,
  getMaxFileSizeBytes,
  updateLocalStoragePaths,
  updateMaxFileSizeGB,
  isFileSizeValid,
  formatFileSize,
  getMaxConcurrentTransfers,
} from '../../utils/config';

describe('Configuration', () => {
  describe('Local Storage Paths', () => {
    it('should return default path when LOCAL_STORAGE_PATHS not set', () => {
      const paths = getLocalStoragePaths();
      expect(paths).toEqual(['/opt/app-root/src/data']);
    });

    it('should parse comma-separated paths from environment', () => {
      const originalValue = process.env.LOCAL_STORAGE_PATHS;
      process.env.LOCAL_STORAGE_PATHS = '/path1,/path2,/path3';

      // Re-import to pick up new env var
      jest.resetModules();
      const { getLocalStoragePaths: getPathsFresh } = require('../../utils/config');

      const paths = getPathsFresh();
      expect(paths).toEqual(['/path1', '/path2', '/path3']);

      process.env.LOCAL_STORAGE_PATHS = originalValue;
      jest.resetModules();
    });

    it('should trim whitespace from paths', () => {
      const originalValue = process.env.LOCAL_STORAGE_PATHS;
      process.env.LOCAL_STORAGE_PATHS = ' /path1 , /path2 , /path3 ';

      jest.resetModules();
      const { getLocalStoragePaths: getPathsFresh } = require('../../utils/config');

      const paths = getPathsFresh();
      expect(paths).toEqual(['/path1', '/path2', '/path3']);

      process.env.LOCAL_STORAGE_PATHS = originalValue;
      jest.resetModules();
    });

    it('should filter out empty paths', () => {
      updateLocalStoragePaths(['/path1', '', '/path2', '   ']);
      const paths = getLocalStoragePaths();
      expect(paths).toEqual(['/path1', '/path2']);
    });

    it('should update paths at runtime', () => {
      updateLocalStoragePaths(['/new/path1', '/new/path2']);
      const paths = getLocalStoragePaths();
      expect(paths).toEqual(['/new/path1', '/new/path2']);
    });

    it('should return copy to prevent mutation', () => {
      updateLocalStoragePaths(['/path1', '/path2']);
      const paths1 = getLocalStoragePaths();
      paths1.push('/path3');
      const paths2 = getLocalStoragePaths();
      expect(paths2).toEqual(['/path1', '/path2']);
    });
  });

  describe('Max File Size', () => {
    it('should return default 20GB when MAX_FILE_SIZE_GB not set', () => {
      const sizeGB = getMaxFileSizeGB();
      expect(sizeGB).toBe(20);
    });

    it('should parse MAX_FILE_SIZE_GB from environment', () => {
      const originalValue = process.env.MAX_FILE_SIZE_GB;
      process.env.MAX_FILE_SIZE_GB = '50';

      jest.resetModules();
      const { getMaxFileSizeGB: getSizeFresh } = require('../../utils/config');

      expect(getSizeFresh()).toBe(50);

      process.env.MAX_FILE_SIZE_GB = originalValue;
      jest.resetModules();
    });

    it('should convert GB to bytes correctly', () => {
      updateMaxFileSizeGB(1);
      const bytes = getMaxFileSizeBytes();
      expect(bytes).toBe(1 * 1024 * 1024 * 1024);
    });

    it('should update max file size at runtime', () => {
      updateMaxFileSizeGB(100);
      expect(getMaxFileSizeGB()).toBe(100);
    });

    it('should throw error for invalid file size', () => {
      expect(() => updateMaxFileSizeGB(-1)).toThrow();
      expect(() => updateMaxFileSizeGB(0)).toThrow();
      expect(() => updateMaxFileSizeGB(NaN)).toThrow();
    });
  });

  describe('File Size Validation', () => {
    beforeEach(() => {
      updateMaxFileSizeGB(1); // 1GB limit for testing
    });

    it('should validate file size within limit', () => {
      const halfGB = 0.5 * 1024 * 1024 * 1024;
      expect(isFileSizeValid(halfGB)).toBe(true);
    });

    it('should reject file size over limit', () => {
      const twoGB = 2 * 1024 * 1024 * 1024;
      expect(isFileSizeValid(twoGB)).toBe(false);
    });

    it('should accept file size exactly at limit', () => {
      const oneGB = 1 * 1024 * 1024 * 1024;
      expect(isFileSizeValid(oneGB)).toBe(true);
    });
  });

  describe('File Size Formatting', () => {
    it('should format GB correctly', () => {
      const size = 2.5 * 1024 * 1024 * 1024;
      expect(formatFileSize(size)).toBe('2.50 GB');
    });

    it('should format MB correctly', () => {
      const size = 512 * 1024 * 1024;
      expect(formatFileSize(size)).toBe('512.00 MB');
    });

    it('should format KB correctly', () => {
      const size = 256 * 1024;
      expect(formatFileSize(size)).toBe('256.00 KB');
    });

    it('should format small sizes in KB', () => {
      const size = 1500;
      expect(formatFileSize(size)).toMatch(/KB$/);
    });
  });

  describe('Max Concurrent Transfers', () => {
    it('should return default 2 when MAX_CONCURRENT_TRANSFERS not set', () => {
      const limit = getMaxConcurrentTransfers();
      expect(limit).toBe(2);
    });

    it('should parse MAX_CONCURRENT_TRANSFERS from environment', () => {
      const originalValue = process.env.MAX_CONCURRENT_TRANSFERS;
      process.env.MAX_CONCURRENT_TRANSFERS = '5';

      jest.resetModules();
      const { getMaxConcurrentTransfers: getLimitFresh } = require('../../utils/config');

      expect(getLimitFresh()).toBe(5);

      process.env.MAX_CONCURRENT_TRANSFERS = originalValue;
      jest.resetModules();
    });

    it('should use default for invalid values', () => {
      const originalValue = process.env.MAX_CONCURRENT_TRANSFERS;

      process.env.MAX_CONCURRENT_TRANSFERS = 'invalid';
      jest.resetModules();
      let { getMaxConcurrentTransfers: getLimitFresh } = require('../../utils/config');
      expect(getLimitFresh()).toBe(2);

      process.env.MAX_CONCURRENT_TRANSFERS = '0';
      jest.resetModules();
      ({ getMaxConcurrentTransfers: getLimitFresh } = require('../../utils/config'));
      expect(getLimitFresh()).toBe(2);

      process.env.MAX_CONCURRENT_TRANSFERS = '-1';
      jest.resetModules();
      ({ getMaxConcurrentTransfers: getLimitFresh } = require('../../utils/config'));
      expect(getLimitFresh()).toBe(2);

      process.env.MAX_CONCURRENT_TRANSFERS = originalValue;
      jest.resetModules();
    });
  });
});
```

## Acceptance Criteria

- [ ] `LOCAL_STORAGE_PATHS` environment variable parsed correctly
- [ ] Multiple comma-separated paths supported
- [ ] Default path used when environment variable not set
- [ ] `MAX_FILE_SIZE_GB` environment variable parsed correctly
- [ ] Default 20GB used when not configured
- [ ] Invalid values handled gracefully with warnings
- [ ] Configuration can be updated at runtime (for testing)
- [ ] File size validation functions work correctly
- [ ] File size formatting provides human-readable output
- [ ] Unit tests pass with >80% coverage
- [ ] Documentation in .env.example is clear

## Testing Requirements

Run tests:

```bash
cd backend
npm test -- config.test.ts
```

Expected results:

- All tests pass
- Coverage >80% for config.ts
- No runtime errors or warnings with valid configuration

## Notes

- Runtime updates are primarily for testing; production should use environment variables
- File size validation will be used by Phase 1.3, 1.4, and 1.5
- Configuration is read once at startup for performance
- Invalid MAX_FILE_SIZE_GB falls back to default with console warning
- Empty paths in LOCAL_STORAGE_PATHS are filtered out
- Paths are returned as copies to prevent accidental mutation

## Security Considerations

- Path validation will happen in Phase 1.3 (localStorage.ts)
- This module only parses configuration; it doesn't validate filesystem paths
- Malformed environment variables won't crash the application

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 124-139)
- Node.js environment variables: https://nodejs.org/api/process.html#processenv
