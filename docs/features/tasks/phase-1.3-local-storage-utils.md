# Phase 1.3: Local Storage Utilities

> **Task ID**: phase-1.3
> **Estimated Effort**: 1.5-2 days
> **Dependencies**: Phase 0 (Test Infrastructure), Phase 1.2 (Configuration)

## Objective

Create security-hardened local storage utilities with strict path validation, symlink resolution, and comprehensive error handling. This module provides the foundation for all local filesystem operations and is **critical for security**.

## Prerequisites

- Phase 0 completed (test infrastructure with security fixtures)
- Phase 1.2 completed (configuration utilities available)
- Node.js `fs/promises` API familiarity

## Files to Create

- `backend/src/utils/localStorage.ts` - Main utilities module
- `backend/src/__tests__/utils/localStorage.test.ts` - Security-focused unit tests

## Implementation Steps

### Step 1: Define Types and Errors

Create `backend/src/utils/localStorage.ts` with type definitions:

```typescript
import { promises as fs } from 'fs';
import path from 'path';
import { getLocalStoragePaths, getMaxFileSizeBytes } from './config';

/**
 * File or directory entry
 */
export interface FileEntry {
  name: string;
  path: string; // Relative to location root
  type: 'file' | 'directory' | 'symlink';
  size?: number; // Bytes
  modified?: string; // ISO 8601 timestamp
  target?: string; // Symlink target (relative path)
}

/**
 * Storage location descriptor
 */
export interface StorageLocation {
  id: string; // e.g., "local-0", "local-1"
  name: string; // Display name
  path: string; // Filesystem path
  type: 'local';
  available: boolean; // false if directory missing/inaccessible
}

/**
 * Custom errors for better error handling
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

### Step 2: Implement Security-First Path Validation

This is the **most critical function** - implement with extreme care:

```typescript
/**
 * Validate and resolve a path within a storage location
 *
 * SECURITY: This function prevents directory traversal attacks
 * by ensuring the resolved path stays within allowed boundaries
 *
 * @param locationId - Storage location ID (e.g., "local-0")
 * @param relativePath - Relative path within location
 * @returns Validated absolute filesystem path
 * @throws SecurityError if path escapes bounds
 * @throws NotFoundError if location is invalid
 */
export async function validatePath(locationId: string, relativePath: string = ''): Promise<string> {
  // 1. Parse location index from ID
  const match = locationId.match(/^local-(\d+)$/);
  if (!match) {
    throw new NotFoundError(`Invalid location ID: ${locationId}`);
  }

  const index = parseInt(match[1], 10);
  const allowedPaths = getLocalStoragePaths();

  // 2. Check if index is valid
  if (index < 0 || index >= allowedPaths.length) {
    throw new NotFoundError(`Location index out of bounds: ${index}`);
  }

  const basePath = allowedPaths[index];

  // 3. Normalize and join paths
  const normalizedBase = path.normalize(basePath);
  const normalizedRelative = path.normalize(relativePath || '.');

  // 4. Security check: reject absolute paths in relativePath
  if (path.isAbsolute(normalizedRelative)) {
    throw new SecurityError(`Absolute paths not allowed: ${relativePath}`);
  }

  // 5. Join and normalize
  const joinedPath = path.join(normalizedBase, normalizedRelative);

  // 6. Resolve symlinks
  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(joinedPath);
  } catch (error: any) {
    // If path doesn't exist yet (e.g., for creation), check parent
    if (error.code === 'ENOENT') {
      const parentPath = path.dirname(joinedPath);
      try {
        const resolvedParent = await fs.realpath(parentPath);
        // Verify parent is within bounds
        if (
          !resolvedParent.startsWith(normalizedBase + path.sep) &&
          resolvedParent !== normalizedBase
        ) {
          throw new SecurityError(`Path escapes allowed directory: ${relativePath}`);
        }
        // Return the non-existent path (validated via parent)
        return path.join(resolvedParent, path.basename(joinedPath));
      } catch (parentError: any) {
        throw new NotFoundError(`Parent directory not found: ${parentPath}`);
      }
    }

    // Other filesystem errors
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${joinedPath}`);
    }

    throw new StorageError(`Failed to resolve path: ${error.message}`);
  }

  // 7. Security check: ensure resolved path is within base path
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    throw new SecurityError(`Path escapes allowed directory: ${relativePath} -> ${resolvedPath}`);
  }

  return resolvedPath;
}
```

### Step 3: Implement Storage Location Discovery

```typescript
/**
 * Get all configured storage locations with availability check
 *
 * @param logger - Optional Fastify logger for warnings
 * @returns Array of storage locations
 */
export async function getStorageLocations(logger?: any): Promise<StorageLocation[]> {
  const paths = getLocalStoragePaths();
  const locations: StorageLocation[] = [];

  for (let i = 0; i < paths.length; i++) {
    const dirPath = paths[i];
    let available = false;

    try {
      const stats = await fs.stat(dirPath);
      available = stats.isDirectory();

      if (!available && logger) {
        logger.warn(`Path exists but is not a directory: ${dirPath}`);
      }
    } catch (error: any) {
      if (logger) {
        logger.warn(`Local storage path not accessible: ${dirPath} - ${error.message}`);
      }
    }

    locations.push({
      id: `local-${i}`,
      name: path.basename(dirPath) || dirPath,
      path: dirPath,
      type: 'local',
      available,
    });
  }

  return locations;
}
```

### Step 4: Implement File Operations

```typescript
/**
 * List files and directories at the given path
 *
 * @param absolutePath - Validated absolute path
 * @param limit - Maximum number of entries (for pagination)
 * @param offset - Skip this many entries (for pagination)
 * @returns Array of file entries
 */
export async function listDirectory(
  absolutePath: string,
  limit?: number,
  offset: number = 0,
): Promise<{ files: FileEntry[]; totalCount: number }> {
  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const files: FileEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(absolutePath, entry.name);
      const relativePath = entry.name;

      let fileEntry: FileEntry = {
        name: entry.name,
        path: relativePath,
        type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
      };

      // Get metadata for files and symlinks
      if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stats = await fs.stat(entryPath);
          fileEntry.size = stats.size;
          fileEntry.modified = stats.mtime.toISOString();

          // For symlinks, get target
          if (entry.isSymbolicLink()) {
            const target = await fs.readlink(entryPath);
            fileEntry.target = target;
          }
        } catch (error) {
          // Skip entries we can't read
          continue;
        }
      }

      files.push(fileEntry);
    }

    // Sort: directories first, then by name
    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    const totalCount = files.length;

    // Apply pagination if requested
    if (limit !== undefined) {
      return {
        files: files.slice(offset, offset + limit),
        totalCount,
      };
    }

    return { files, totalCount };
  } catch (error: any) {
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${absolutePath}`);
    }
    if (error.code === 'ENOTDIR') {
      throw new StorageError(`Not a directory: ${absolutePath}`);
    }
    throw new StorageError(`Failed to list directory: ${error.message}`);
  }
}

/**
 * Create a directory (mkdir -p behavior)
 *
 * @param absolutePath - Validated absolute path
 */
export async function createDirectory(absolutePath: string): Promise<void> {
  try {
    await fs.mkdir(absolutePath, { recursive: true });
  } catch (error: any) {
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${absolutePath}`);
    }
    if (error.code === 'ENOSPC') {
      throw new StorageError('Disk full');
    }
    throw new StorageError(`Failed to create directory: ${error.message}`);
  }
}

/**
 * Delete a file or directory (recursive for directories)
 *
 * @param absolutePath - Validated absolute path
 * @returns Number of items deleted
 */
export async function deleteFileOrDirectory(absolutePath: string): Promise<number> {
  try {
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      // Count items before deletion
      const entries = await fs.readdir(absolutePath, { recursive: true });
      const count = entries.length + 1; // +1 for the directory itself

      await fs.rm(absolutePath, { recursive: true, force: true });
      return count;
    } else {
      await fs.unlink(absolutePath);
      return 1;
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new NotFoundError(`File not found: ${absolutePath}`);
    }
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${absolutePath}`);
    }
    throw new StorageError(`Failed to delete: ${error.message}`);
  }
}

/**
 * Get file metadata
 *
 * @param absolutePath - Validated absolute path
 * @returns File entry with metadata
 */
export async function getFileMetadata(absolutePath: string): Promise<FileEntry> {
  try {
    const stats = await fs.lstat(absolutePath);
    const name = path.basename(absolutePath);

    const entry: FileEntry = {
      name,
      path: name,
      type: stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'file',
      size: stats.size,
      modified: stats.mtime.toISOString(),
    };

    // Get symlink target
    if (stats.isSymbolicLink()) {
      entry.target = await fs.readlink(absolutePath);
    }

    return entry;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new NotFoundError(`File not found: ${absolutePath}`);
    }
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${absolutePath}`);
    }
    throw new StorageError(`Failed to get metadata: ${error.message}`);
  }
}

/**
 * Create a readable stream for a file
 *
 * @param absolutePath - Validated absolute path
 * @returns Node.js Readable stream
 */
export async function streamFile(absolutePath: string): Promise<NodeJS.ReadableStream> {
  try {
    // Verify file exists and is readable
    await fs.access(absolutePath, fs.constants.R_OK);

    const { createReadStream } = await import('fs');
    return createReadStream(absolutePath, { highWaterMark: 64 * 1024 });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new NotFoundError(`File not found: ${absolutePath}`);
    }
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${absolutePath}`);
    }
    throw new StorageError(`Failed to stream file: ${error.message}`);
  }
}

/**
 * Check if file size is within limits
 *
 * @param absolutePath - Validated absolute path
 * @throws StorageError if file exceeds size limit
 */
export async function checkFileSize(absolutePath: string): Promise<void> {
  try {
    const stats = await fs.stat(absolutePath);
    const maxSize = getMaxFileSizeBytes();

    if (stats.size > maxSize) {
      const sizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
      const limitGB = (maxSize / (1024 * 1024 * 1024)).toFixed(2);
      throw new StorageError(`File size ${sizeGB}GB exceeds limit of ${limitGB}GB`);
    }
  } catch (error: any) {
    if (error instanceof StorageError) {
      throw error;
    }
    if (error.code === 'ENOENT') {
      throw new NotFoundError(`File not found: ${absolutePath}`);
    }
    throw new StorageError(`Failed to check file size: ${error.message}`);
  }
}
```

### Step 5: Create Comprehensive Security Tests

Create `backend/src/__tests__/utils/localStorage.test.ts`:

```typescript
import {
  validatePath,
  getStorageLocations,
  listDirectory,
  createDirectory,
  deleteFileOrDirectory,
  getFileMetadata,
  checkFileSize,
  SecurityError,
  NotFoundError,
  PermissionError,
  StorageError,
} from '../../utils/localStorage';
import { PATH_TRAVERSAL_ATTACKS, VALID_RELATIVE_PATHS } from './fixtures';
import { updateLocalStoragePaths, updateMaxFileSizeGB } from '../../utils/config';
import { vol } from 'memfs';
import path from 'path';

// Mock fs/promises with memfs
jest.mock('fs/promises');
jest.mock('fs');

describe('Local Storage Utilities - Security Tests', () => {
  beforeEach(() => {
    vol.reset();
    updateLocalStoragePaths(['/opt/app-root/src/data', '/opt/app-root/src/models']);

    // Create mock filesystem
    vol.fromJSON({
      '/opt/app-root/src/data/file.txt': 'content',
      '/opt/app-root/src/data/subdir/nested.txt': 'nested',
      '/opt/app-root/src/models/model.bin': 'binary',
      '/etc/passwd': 'root:x:0:0',
      '/tmp/outside.txt': 'outside',
    });
  });

  describe('validatePath - Path Traversal Protection', () => {
    it.each(PATH_TRAVERSAL_ATTACKS)(
      'should reject path traversal attack: %s',
      async (attackPath) => {
        await expect(validatePath('local-0', attackPath)).rejects.toThrow(SecurityError);
      },
    );

    it.each(VALID_RELATIVE_PATHS)('should accept valid relative path: %s', async (validPath) => {
      // Create the path first
      const fullPath = path.join('/opt/app-root/src/data', validPath);
      if (validPath && validPath !== '.') {
        vol.mkdirSync(path.dirname(fullPath), { recursive: true });
        vol.writeFileSync(fullPath, 'test');
      }

      await expect(validatePath('local-0', validPath)).resolves.toBeDefined();
    });

    it('should reject invalid location ID format', async () => {
      await expect(validatePath('invalid-id', 'file.txt')).rejects.toThrow(NotFoundError);
    });

    it('should reject out-of-bounds location index', async () => {
      await expect(validatePath('local-99', 'file.txt')).rejects.toThrow(NotFoundError);
    });

    it('should reject absolute paths in relativePath', async () => {
      await expect(validatePath('local-0', '/etc/passwd')).rejects.toThrow(SecurityError);
    });

    it('should allow symlinks within bounds', async () => {
      vol.symlinkSync('/opt/app-root/src/data/file.txt', '/opt/app-root/src/data/link');

      await expect(validatePath('local-0', 'link')).resolves.toMatch(
        /\/opt\/app-root\/src\/data\/file\.txt$/,
      );
    });

    it('should reject symlinks escaping bounds', async () => {
      vol.symlinkSync('/etc/passwd', '/opt/app-root/src/data/evil-link');

      await expect(validatePath('local-0', 'evil-link')).rejects.toThrow(SecurityError);
    });
  });

  describe('getStorageLocations', () => {
    it('should return all configured locations', async () => {
      const locations = await getStorageLocations();

      expect(locations).toHaveLength(2);
      expect(locations[0]).toMatchObject({
        id: 'local-0',
        type: 'local',
        path: '/opt/app-root/src/data',
        available: true,
      });
    });

    it('should mark unavailable locations', async () => {
      updateLocalStoragePaths(['/opt/app-root/src/data', '/mnt/missing']);

      const locations = await getStorageLocations();

      expect(locations[1]).toMatchObject({
        id: 'local-1',
        available: false,
      });
    });

    it('should log warnings for unavailable paths', async () => {
      const mockLogger = { warn: jest.fn() };
      updateLocalStoragePaths(['/opt/app-root/src/data', '/mnt/missing']);

      await getStorageLocations(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('listDirectory', () => {
    it('should list files and directories', async () => {
      const { files } = await listDirectory('/opt/app-root/src/data');

      expect(files).toContainEqual(expect.objectContaining({ name: 'file.txt', type: 'file' }));
      expect(files).toContainEqual(expect.objectContaining({ name: 'subdir', type: 'directory' }));
    });

    it('should include file metadata', async () => {
      const { files } = await listDirectory('/opt/app-root/src/data');
      const file = files.find((f) => f.name === 'file.txt');

      expect(file).toMatchObject({
        name: 'file.txt',
        type: 'file',
        size: expect.any(Number),
        modified: expect.any(String),
      });
    });

    it('should support pagination', async () => {
      const { files, totalCount } = await listDirectory('/opt/app-root/src/data', 1, 0);

      expect(files).toHaveLength(1);
      expect(totalCount).toBeGreaterThan(1);
    });

    it('should sort directories first', async () => {
      const { files } = await listDirectory('/opt/app-root/src/data');

      const firstDir = files.findIndex((f) => f.type === 'directory');
      const firstFile = files.findIndex((f) => f.type === 'file');

      if (firstDir !== -1 && firstFile !== -1) {
        expect(firstDir).toBeLessThan(firstFile);
      }
    });

    it('should throw PermissionError for EACCES', async () => {
      // Mock permission error
      const originalReaddir = vol.readdirSync;
      vol.readdirSync = jest.fn(() => {
        const error: any = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      });

      await expect(listDirectory('/opt/app-root/src/data')).rejects.toThrow(PermissionError);

      vol.readdirSync = originalReaddir;
    });
  });

  describe('createDirectory', () => {
    it('should create directory', async () => {
      await createDirectory('/opt/app-root/src/data/newdir');

      expect(vol.existsSync('/opt/app-root/src/data/newdir')).toBe(true);
    });

    it('should create nested directories (mkdir -p)', async () => {
      await createDirectory('/opt/app-root/src/data/deep/nested/dir');

      expect(vol.existsSync('/opt/app-root/src/data/deep/nested/dir')).toBe(true);
    });

    it('should throw PermissionError for EACCES', async () => {
      const originalMkdir = vol.mkdirSync;
      vol.mkdirSync = jest.fn(() => {
        const error: any = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      });

      await expect(createDirectory('/opt/app-root/src/data/forbidden')).rejects.toThrow(
        PermissionError,
      );

      vol.mkdirSync = originalMkdir;
    });
  });

  describe('deleteFileOrDirectory', () => {
    it('should delete file', async () => {
      const count = await deleteFileOrDirectory('/opt/app-root/src/data/file.txt');

      expect(count).toBe(1);
      expect(vol.existsSync('/opt/app-root/src/data/file.txt')).toBe(false);
    });

    it('should delete directory recursively', async () => {
      const count = await deleteFileOrDirectory('/opt/app-root/src/data/subdir');

      expect(count).toBeGreaterThan(0);
      expect(vol.existsSync('/opt/app-root/src/data/subdir')).toBe(false);
    });

    it('should throw NotFoundError for non-existent path', async () => {
      await expect(deleteFileOrDirectory('/opt/app-root/src/data/missing.txt')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('checkFileSize', () => {
    beforeEach(() => {
      updateMaxFileSizeGB(1); // 1GB limit
    });

    it('should pass for file within limit', async () => {
      await expect(checkFileSize('/opt/app-root/src/data/file.txt')).resolves.not.toThrow();
    });

    it('should throw for file exceeding limit', async () => {
      // Create large file
      const largeContent = 'x'.repeat(2 * 1024 * 1024 * 1024); // 2GB
      vol.writeFileSync('/opt/app-root/src/data/large.bin', largeContent);

      await expect(checkFileSize('/opt/app-root/src/data/large.bin')).rejects.toThrow(StorageError);
    });
  });
});
```

## Acceptance Criteria

- [ ] Path validation rejects all traversal attack vectors
- [ ] Path validation accepts all valid relative paths
- [ ] Symlinks within bounds are allowed
- [ ] Symlinks escaping bounds are rejected
- [ ] Storage locations correctly report availability
- [ ] Directory listing returns proper metadata
- [ ] Pagination works correctly
- [ ] Directory creation supports mkdir -p behavior
- [ ] Recursive deletion works correctly
- [ ] File size validation enforces limits
- [ ] Custom errors provide clear messages
- [ ] All security tests pass
- [ ] Unit test coverage >90% (critical security module)
- [ ] No false positives (valid paths not rejected)
- [ ] No false negatives (attack paths not allowed)

## Testing Requirements

Run security tests:

```bash
cd backend
npm test -- localStorage.test.ts
```

Expected results:

- All security tests pass (100% pass rate for traversal attacks)
- Coverage >90% (this is a critical security module)
- No console errors or warnings

## Security Review Checklist

Before marking this phase complete, verify:

- [ ] Path validation uses `fs.realpath()` to resolve symlinks
- [ ] Resolved paths are checked against base path with strict comparison
- [ ] Absolute paths in `relativePath` are rejected
- [ ] Invalid location IDs throw errors
- [ ] All path operations use validated paths only
- [ ] Error messages don't leak sensitive path information
- [ ] Test fixtures cover Unicode normalization attacks
- [ ] Test fixtures cover null byte injection
- [ ] Test fixtures cover URL-encoded traversal attempts
- [ ] Test fixtures cover Windows-style paths (if applicable)

## Notes

- This is the **most security-critical module** in the feature
- Path validation must be thorough to prevent directory traversal
- Symlinks are allowed but must resolve within bounds
- Custom errors enable proper HTTP status code mapping in routes
- Missing directories are logged but don't fail startup
- File size checks happen before streaming to prevent memory issues
- All filesystem operations use async APIs for performance

## Common Pitfalls to Avoid

1. **Don't** skip symlink resolution - attackers can use symlinks to escape
2. **Don't** trust `path.normalize()` alone - it doesn't resolve symlinks
3. **Don't** allow absolute paths in `relativePath` parameter
4. **Don't** forget to check resolved path starts with base path
5. **Don't** use `startsWith()` without trailing separator (false positives)

## References

- Feature spec: `docs/features/pvc-storage-support.md` (lines 141-194)
- OWASP Path Traversal: https://owasp.org/www-community/attacks/Path_Traversal
- Node.js fs.realpath: https://nodejs.org/api/fs.html#fspromisesrealpathpath-options
- Node.js path module: https://nodejs.org/api/path.html
