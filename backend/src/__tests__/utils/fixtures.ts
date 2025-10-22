/**
 * Path validation attack vectors for security testing
 */
export const PATH_TRAVERSAL_ATTACKS = [
  '../../../etc/passwd',
  '..%2F..%2F..%2Fetc%2Fpasswd',
  '..\\..\\..\\windows\\system32',
  'test\x00hidden',
  '/etc/passwd',
  '~/../../etc/passwd',
  'test/../../../etc/passwd',
  'test/../../',
  './../../etc/passwd',
  // Unicode normalization attacks
  'test\u002e\u002e/etc',
  // Null byte injection
  'file.txt\x00.exe',
  // Windows-specific
  'C:\\Windows\\System32',
  '\\\\server\\share',
];

/**
 * Valid relative paths that should pass validation
 */
export const VALID_RELATIVE_PATHS = [
  'file.txt',
  'subdir/file.txt',
  'deep/nested/path/file.txt',
  'file-with-dashes.txt',
  'file_with_underscores.txt',
  'file.multiple.dots.txt',
  '.',
  '',
];

/**
 * Sample storage locations for testing
 */
export const MOCK_STORAGE_LOCATIONS = [
  {
    id: 'local-0',
    name: 'Data Storage',
    path: '/opt/app-root/src/data',
    type: 'local' as const,
    available: true,
  },
  {
    id: 'local-1',
    name: 'Model Storage',
    path: '/opt/app-root/src/models',
    type: 'local' as const,
    available: true,
  },
  {
    id: 'local-2',
    name: 'Unavailable Storage',
    path: '/mnt/missing',
    type: 'local' as const,
    available: false,
  },
];

/**
 * Sample file entries for testing
 */
export const MOCK_FILE_ENTRIES = [
  {
    name: 'document.txt',
    path: 'document.txt',
    type: 'file' as const,
    size: 1024,
    modified: '2025-10-23T10:00:00Z',
  },
  {
    name: 'images',
    path: 'images',
    type: 'directory' as const,
  },
  {
    name: 'link-to-file',
    path: 'link-to-file',
    type: 'symlink' as const,
    target: 'document.txt',
  },
];

/**
 * Sample transfer job for testing
 */
export const MOCK_TRANSFER_JOB = {
  id: 'job-123',
  type: 'cross-storage' as const,
  status: 'active' as const,
  files: [
    {
      sourcePath: 'local-0/file1.txt',
      destinationPath: 's3-bucket/file1.txt',
      size: 1024,
      loaded: 512,
      status: 'transferring' as const,
    },
  ],
  progress: {
    totalFiles: 1,
    completedFiles: 0,
    totalBytes: 1024,
    loadedBytes: 512,
    percentage: 50,
  },
};
