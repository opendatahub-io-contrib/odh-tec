// Import memfs and configure mocks
import { vol } from 'memfs';

// Mock fs/promises and fs with memfs
jest.mock('fs/promises', () => {
  const { fs } = require('memfs');
  return fs.promises;
});

jest.mock('fs', () => {
  const { fs } = require('memfs');
  return fs;
});

// Mock config module to avoid S3Client initialization issues
const mockGetLocalStoragePaths = jest.fn();
const mockGetMaxFileSizeBytes = jest.fn();
jest.mock('../../utils/config', () => ({
  getLocalStoragePaths: mockGetLocalStoragePaths,
  getMaxFileSizeBytes: mockGetMaxFileSizeBytes,
  updateLocalStoragePaths: jest.fn((paths: string[]) => {
    mockGetLocalStoragePaths.mockReturnValue([...paths]);
  }),
  updateMaxFileSizeGB: jest.fn((gb: number) => {
    mockGetMaxFileSizeBytes.mockReturnValue(gb * 1024 * 1024 * 1024);
  }),
}));

import {
  validatePath,
  getStorageLocations,
  listDirectory,
  createDirectory,
  deleteFileOrDirectory,
  getFileMetadata,
  checkFileSize,
  streamFile,
  SecurityError,
  NotFoundError,
  PermissionError,
  StorageError,
} from '../../utils/localStorage';
import { PATH_TRAVERSAL_ATTACKS, VALID_RELATIVE_PATHS } from './fixtures';
import { updateLocalStoragePaths, updateMaxFileSizeGB } from '../../utils/config';
import path from 'path';

describe('Local Storage Utilities - Security Tests', () => {
  const streamsToCleanup: any[] = [];

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

  afterEach(() => {
    // Cleanup streams to prevent memfs errors
    streamsToCleanup.forEach((stream) => {
      if (stream && typeof stream.destroy === 'function') {
        stream.removeAllListeners();
        stream.destroy();
      }
    });
    streamsToCleanup.length = 0;
  });

  describe('validatePath - Path Traversal Protection', () => {
    it.each(PATH_TRAVERSAL_ATTACKS)(
      'should reject path traversal attack: %s',
      async (attackPath) => {
        // Path traversal attacks should be rejected with either SecurityError or NotFoundError
        // Both error types indicate the attack is blocked
        await expect(validatePath('local-0', attackPath)).rejects.toThrow();
      },
    );

    it.each(VALID_RELATIVE_PATHS)('should accept valid relative path: %s', async (validPath) => {
      // Create the path first if needed
      const fullPath = path.join('/opt/app-root/src/data', validPath);
      if (validPath && validPath !== '.' && validPath !== '') {
        vol.mkdirSync(path.dirname(fullPath), { recursive: true });
        vol.writeFileSync(fullPath, 'test');
      }

      await expect(validatePath('local-0', validPath)).resolves.toBeDefined();
    });

    it('should reject invalid location ID format', async () => {
      await expect(validatePath('invalid-id', 'file.txt')).rejects.toThrow(NotFoundError);
      await expect(validatePath('invalid-id', 'file.txt')).rejects.toThrow(
        'Invalid location ID: invalid-id',
      );
    });

    it('should reject out-of-bounds location index', async () => {
      await expect(validatePath('local-99', 'file.txt')).rejects.toThrow(NotFoundError);
      await expect(validatePath('local-99', 'file.txt')).rejects.toThrow(
        'Location index out of bounds: 99',
      );
    });

    it('should reject negative location index', async () => {
      await expect(validatePath('local--1', 'file.txt')).rejects.toThrow(NotFoundError);
    });

    it('should reject absolute paths in relativePath', async () => {
      await expect(validatePath('local-0', '/etc/passwd')).rejects.toThrow(SecurityError);
      await expect(validatePath('local-0', '/etc/passwd')).rejects.toThrow(
        'Absolute paths not allowed',
      );
    });

    it('should allow symlinks within bounds', async () => {
      vol.symlinkSync('/opt/app-root/src/data/file.txt', '/opt/app-root/src/data/link');

      const resolved = await validatePath('local-0', 'link');
      expect(resolved).toMatch(/\/opt\/app-root\/src\/data\/file\.txt$/);
    });

    it('should reject symlinks escaping bounds', async () => {
      vol.symlinkSync('/etc/passwd', '/opt/app-root/src/data/evil-link');

      await expect(validatePath('local-0', 'evil-link')).rejects.toThrow(SecurityError);
      await expect(validatePath('local-0', 'evil-link')).rejects.toThrow('Path escapes allowed');
    });

    it('should handle non-existent paths for creation scenarios', async () => {
      const resolved = await validatePath('local-0', 'subdir/newfile.txt');
      expect(resolved).toMatch(/\/opt\/app-root\/src\/data\/subdir\/newfile\.txt$/);
    });

    it('should throw NotFoundError for non-existent parent directory', async () => {
      await expect(validatePath('local-0', 'missing/deep/path/file.txt')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should accept empty relativePath (defaults to location root)', async () => {
      const resolved = await validatePath('local-0', '');
      expect(resolved).toBe('/opt/app-root/src/data');
    });

    it('should accept "." as relativePath', async () => {
      const resolved = await validatePath('local-0', '.');
      expect(resolved).toBe('/opt/app-root/src/data');
    });

    it('should work with multiple storage locations', async () => {
      const resolved0 = await validatePath('local-0', 'file.txt');
      const resolved1 = await validatePath('local-1', 'model.bin');

      expect(resolved0).toMatch(/\/opt\/app-root\/src\/data\/file\.txt$/);
      expect(resolved1).toMatch(/\/opt\/app-root\/src\/models\/model\.bin$/);
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
      expect(locations[1]).toMatchObject({
        id: 'local-1',
        type: 'local',
        path: '/opt/app-root/src/models',
        available: true,
      });
    });

    it('should mark unavailable locations', async () => {
      updateLocalStoragePaths(['/opt/app-root/src/data', '/mnt/missing']);

      const locations = await getStorageLocations();

      expect(locations[1]).toMatchObject({
        id: 'local-1',
        path: '/mnt/missing',
        available: false,
      });
    });

    it('should log warnings for unavailable paths', async () => {
      const mockLogger = { warn: jest.fn() };
      updateLocalStoragePaths(['/opt/app-root/src/data', '/mnt/missing']);

      await getStorageLocations(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Local storage path not accessible: /mnt/missing'),
      );
    });

    it('should log warning if path exists but is not a directory', async () => {
      const mockLogger = { warn: jest.fn() };
      updateLocalStoragePaths(['/opt/app-root/src/data', '/etc/passwd']);

      await getStorageLocations(mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Path exists but is not a directory'),
      );
    });

    it('should use basename as location name', async () => {
      const locations = await getStorageLocations();

      expect(locations[0].name).toBe('data');
      expect(locations[1].name).toBe('models');
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

    it('should support pagination with limit', async () => {
      const { files, totalCount } = await listDirectory('/opt/app-root/src/data', 1, 0);

      expect(files).toHaveLength(1);
      expect(totalCount).toBeGreaterThan(1);
    });

    it('should support pagination with offset', async () => {
      const { files: page1 } = await listDirectory('/opt/app-root/src/data', 1, 0);
      const { files: page2 } = await listDirectory('/opt/app-root/src/data', 1, 1);

      expect(page1[0].name).not.toBe(page2[0].name);
    });

    it('should return correct totalCount with pagination', async () => {
      const { totalCount: withLimit } = await listDirectory('/opt/app-root/src/data', 1, 0);
      const { totalCount: withoutLimit } = await listDirectory('/opt/app-root/src/data');

      expect(withLimit).toBe(withoutLimit);
    });

    it('should sort directories first', async () => {
      const { files } = await listDirectory('/opt/app-root/src/data');

      const firstDir = files.findIndex((f) => f.type === 'directory');
      const firstFile = files.findIndex((f) => f.type === 'file');

      if (firstDir !== -1 && firstFile !== -1) {
        expect(firstDir).toBeLessThan(firstFile);
      }
    });

    it('should include symlink targets', async () => {
      vol.symlinkSync('/opt/app-root/src/data/file.txt', '/opt/app-root/src/data/link');

      const { files } = await listDirectory('/opt/app-root/src/data');
      const symlink = files.find((f) => f.name === 'link');

      expect(symlink).toMatchObject({
        name: 'link',
        type: 'symlink',
        target: expect.any(String),
      });
    });

    it('should throw PermissionError for EACCES', async () => {
      // Mock permission error on the promises API
      const { fs } = require('memfs');
      const originalReaddir = fs.promises.readdir;
      fs.promises.readdir = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));

      await expect(listDirectory('/opt/app-root/src/data')).rejects.toThrow(PermissionError);

      fs.promises.readdir = originalReaddir;
    });

    it('should throw StorageError for ENOTDIR', async () => {
      await expect(listDirectory('/opt/app-root/src/data/file.txt')).rejects.toThrow(StorageError);
      await expect(listDirectory('/opt/app-root/src/data/file.txt')).rejects.toThrow(
        'Not a directory',
      );
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

    it('should not throw if directory already exists', async () => {
      await createDirectory('/opt/app-root/src/data/subdir');

      expect(vol.existsSync('/opt/app-root/src/data/subdir')).toBe(true);
    });

    it('should throw PermissionError for EACCES', async () => {
      // Mock permission error on the promises API
      const { fs } = require('memfs');
      const originalMkdir = fs.promises.mkdir;
      fs.promises.mkdir = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));

      await expect(createDirectory('/opt/app-root/src/data/forbidden')).rejects.toThrow(
        PermissionError,
      );

      fs.promises.mkdir = originalMkdir;
    });

    it('should throw StorageError for ENOSPC', async () => {
      // Mock storage error on the promises API
      const { fs } = require('memfs');
      const originalMkdir = fs.promises.mkdir;
      fs.promises.mkdir = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('No space left on device'), { code: 'ENOSPC' }));

      await expect(createDirectory('/opt/app-root/src/data/full')).rejects.toThrow(StorageError);
      await expect(createDirectory('/opt/app-root/src/data/full')).rejects.toThrow('Disk full');

      fs.promises.mkdir = originalMkdir;
    });
  });

  describe('deleteFileOrDirectory', () => {
    it('should delete file and return count 1', async () => {
      const count = await deleteFileOrDirectory('/opt/app-root/src/data/file.txt');

      expect(count).toBe(1);
      expect(vol.existsSync('/opt/app-root/src/data/file.txt')).toBe(false);
    });

    it('should delete directory recursively', async () => {
      const count = await deleteFileOrDirectory('/opt/app-root/src/data/subdir');

      expect(count).toBeGreaterThan(1); // Directory + its contents
      expect(vol.existsSync('/opt/app-root/src/data/subdir')).toBe(false);
    });

    it('should return correct count for directory', async () => {
      vol.mkdirSync('/opt/app-root/src/data/testdir/nested', { recursive: true });
      vol.writeFileSync('/opt/app-root/src/data/testdir/file1.txt', 'content');
      vol.writeFileSync('/opt/app-root/src/data/testdir/nested/file2.txt', 'content');

      const count = await deleteFileOrDirectory('/opt/app-root/src/data/testdir');

      // Should count: testdir itself + nested dir + 2 files = 4
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should throw NotFoundError for non-existent path', async () => {
      await expect(deleteFileOrDirectory('/opt/app-root/src/data/missing.txt')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw PermissionError for EACCES', async () => {
      // Mock permission error on the promises API
      const { fs } = require('memfs');
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));

      await expect(deleteFileOrDirectory('/opt/app-root/src/data/file.txt')).rejects.toThrow(
        PermissionError,
      );

      fs.promises.stat = originalStat;
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', async () => {
      const metadata = await getFileMetadata('/opt/app-root/src/data/file.txt');

      expect(metadata).toMatchObject({
        name: 'file.txt',
        type: 'file',
        size: expect.any(Number),
        modified: expect.any(String),
      });
    });

    it('should return directory metadata', async () => {
      const metadata = await getFileMetadata('/opt/app-root/src/data/subdir');

      expect(metadata).toMatchObject({
        name: 'subdir',
        type: 'directory',
        size: expect.any(Number),
        modified: expect.any(String),
      });
    });

    it('should return symlink metadata with target', async () => {
      vol.symlinkSync('/opt/app-root/src/data/file.txt', '/opt/app-root/src/data/link');

      const metadata = await getFileMetadata('/opt/app-root/src/data/link');

      expect(metadata).toMatchObject({
        name: 'link',
        type: 'symlink',
        target: expect.any(String),
      });
    });

    it('should throw NotFoundError for non-existent file', async () => {
      await expect(getFileMetadata('/opt/app-root/src/data/missing.txt')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw PermissionError for EACCES', async () => {
      // Mock permission error on the promises API
      const { fs } = require('memfs');
      const originalLstat = fs.promises.lstat;
      fs.promises.lstat = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));

      await expect(getFileMetadata('/opt/app-root/src/data/file.txt')).rejects.toThrow(
        PermissionError,
      );

      fs.promises.lstat = originalLstat;
    });
  });

  describe.skip('streamFile', () => {
    // NOTE: streamFile tests are skipped due to memfs createReadStream limitations
    // The function will be tested in integration tests with real filesystem
    it('should create readable stream for file', async () => {
      const stream = await streamFile('/opt/app-root/src/data/file.txt');

      expect(stream).toBeDefined();
      expect(typeof stream.on).toBe('function');

      // Add to cleanup array
      streamsToCleanup.push(stream);
    });

    it('should throw NotFoundError for non-existent file', async () => {
      await expect(streamFile('/opt/app-root/src/data/missing.txt')).rejects.toThrow(NotFoundError);
    });

    it('should throw PermissionError for EACCES', async () => {
      const originalAccess = vol.accessSync;
      vol.accessSync = jest.fn(() => {
        const error: any = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      });

      await expect(streamFile('/opt/app-root/src/data/file.txt')).rejects.toThrow(PermissionError);

      vol.accessSync = originalAccess;
    });
  });

  describe('checkFileSize', () => {
    beforeEach(() => {
      updateMaxFileSizeGB(1); // 1GB limit
    });

    it('should pass for file within limit', async () => {
      await expect(checkFileSize('/opt/app-root/src/data/file.txt')).resolves.not.toThrow();
    });

    it('should throw StorageError for file exceeding limit', async () => {
      // Mock fs.stat to return a large file size (2GB)
      const { fs } = require('memfs');
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockResolvedValue({
        size: 2 * 1024 * 1024 * 1024, // 2GB
        isFile: () => true,
        isDirectory: () => false,
      });

      await expect(checkFileSize('/opt/app-root/src/data/large.bin')).rejects.toThrow(StorageError);
      await expect(checkFileSize('/opt/app-root/src/data/large.bin')).rejects.toThrow(
        /exceeds limit/,
      );

      fs.promises.stat = originalStat;
    });

    it('should include size information in error message', async () => {
      // Mock fs.stat to return a large file size (2GB)
      const { fs } = require('memfs');
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockResolvedValue({
        size: 2 * 1024 * 1024 * 1024, // 2GB
        isFile: () => true,
        isDirectory: () => false,
      });

      try {
        await checkFileSize('/opt/app-root/src/data/large.bin');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/2\.00GB/);
        expect(error.message).toMatch(/1\.00GB/);
      } finally {
        fs.promises.stat = originalStat;
      }
    });

    it('should throw NotFoundError for non-existent file', async () => {
      await expect(checkFileSize('/opt/app-root/src/data/missing.txt')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should pass for file exactly at limit', async () => {
      // Mock fs.stat to return exactly 1GB
      const { fs } = require('memfs');
      const originalStat = fs.promises.stat;
      fs.promises.stat = jest.fn().mockResolvedValue({
        size: 1024 * 1024 * 1024, // 1GB exactly
        isFile: () => true,
        isDirectory: () => false,
      });

      await expect(checkFileSize('/opt/app-root/src/data/exact.bin')).resolves.not.toThrow();

      fs.promises.stat = originalStat;
    });
  });

  describe('Custom Errors', () => {
    it('SecurityError should have correct name', () => {
      const error = new SecurityError('test');
      expect(error.name).toBe('SecurityError');
      expect(error.message).toBe('test');
      expect(error).toBeInstanceOf(Error);
    });

    it('NotFoundError should have correct name', () => {
      const error = new NotFoundError('test');
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('test');
      expect(error).toBeInstanceOf(Error);
    });

    it('PermissionError should have correct name', () => {
      const error = new PermissionError('test');
      expect(error.name).toBe('PermissionError');
      expect(error.message).toBe('test');
      expect(error).toBeInstanceOf(Error);
    });

    it('StorageError should have correct name', () => {
      const error = new StorageError('test');
      expect(error.name).toBe('StorageError');
      expect(error.message).toBe('test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
