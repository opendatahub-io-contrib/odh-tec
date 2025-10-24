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
export async function validatePath(locationId: string, relativePath = ''): Promise<string> {
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

  // 3. Security: Decode URL-encoded characters to prevent encoded traversal attacks
  let decodedPath = relativePath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch (error) {
    // If decoding fails, use original (better safe than sorry)
    decodedPath = relativePath;
  }

  // 4. Security: Normalize Unicode to prevent Unicode normalization attacks
  // Convert Unicode characters like \u002e (.) and \u002f (/) to their canonical form
  const normalizedUnicode = decodedPath.normalize('NFC');

  // 5. Security: Reject backslashes (Windows-style paths on Linux)
  if (normalizedUnicode.includes('\\')) {
    throw new SecurityError('Backslash characters not allowed in paths');
  }

  // 6. Security: Reject null bytes
  if (normalizedUnicode.includes('\0')) {
    throw new SecurityError('Null bytes not allowed in paths');
  }

  // 7. Normalize and join paths
  const normalizedBase = path.normalize(basePath);
  const normalizedRelative = path.normalize(normalizedUnicode || '.');

  // 7. Security check: reject absolute paths in relativePath
  if (path.isAbsolute(normalizedRelative)) {
    throw new SecurityError(`Absolute paths not allowed: ${relativePath}`);
  }

  // 8. Join and normalize
  const joinedPath = path.join(normalizedBase, normalizedRelative);

  // 9. Security: Pre-flight check - detect obvious traversal attempts before filesystem access
  // This catches cases like "../../../etc" before trying fs.realpath
  if (!joinedPath.startsWith(normalizedBase + path.sep) && joinedPath !== normalizedBase) {
    throw new SecurityError(`Path escapes allowed directory: ${relativePath}`);
  }

  // 10. Resolve symlinks
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
        // If parent resolution also fails, it might be a traversal attempt
        // Check if the requested path is trying to escape
        if (!parentPath.startsWith(normalizedBase + path.sep) && parentPath !== normalizedBase) {
          throw new SecurityError(`Path escapes allowed directory: ${relativePath}`);
        }
        throw new NotFoundError(`Parent directory not found: ${parentPath}`);
      }
    }

    // Other filesystem errors
    if (error.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${joinedPath}`);
    }

    throw new StorageError(`Failed to resolve path: ${error.message}`);
  }

  // 11. Security check: ensure resolved path is within base path
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    throw new SecurityError(`Path escapes allowed directory: ${relativePath} -> ${resolvedPath}`);
  }

  return resolvedPath;
}

/**
 * Get all configured storage locations with availability check
 *
 * @param logger - Optional Fastify logger for warnings
 * @returns Array of storage locations
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
        logger.warn(
          {
            path: dirPath,
            isFile: stats.isFile(),
            isSymlink: stats.isSymbolicLink(),
          },
          `Path exists but is not a directory: ${dirPath}`,
        );
      } else if (available && logger) {
        logger.debug(
          {
            path: dirPath,
            locationId: `local-${i}`,
          },
          `Local storage directory verified: ${dirPath}`,
        );
      }
    } catch (error: any) {
      if (logger) {
        const errorDetails: any = {
          path: dirPath,
          locationId: `local-${i}`,
          errorCode: error.code,
          errorMessage: error.message,
        };

        // Provide specific guidance based on error type
        if (error.code === 'ENOENT') {
          logger.warn(
            errorDetails,
            `Local storage path does not exist: ${dirPath} - Create this directory or update LOCAL_STORAGE_PATHS`,
          );
        } else if (error.code === 'EACCES') {
          logger.warn(
            errorDetails,
            `Local storage path permission denied: ${dirPath} - Check directory permissions`,
          );
        } else {
          logger.warn(
            errorDetails,
            `Local storage path not accessible: ${dirPath} - ${error.message}`,
          );
        }
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
  offset = 0,
): Promise<{ files: FileEntry[]; totalCount: number }> {
  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });
    const files: FileEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(absolutePath, entry.name);
      const relativePath = entry.name;

      const fileEntry: FileEntry = {
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
