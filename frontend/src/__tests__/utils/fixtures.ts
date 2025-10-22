// TODO: These types will be created in Phase 2.1 (docs/features/tasks/phase-2-1-storage-location-api.md)
// Once created, replace these placeholder types with imports from the actual location
// import { StorageLocation, FileEntry, TransferConflict } from '../../app/services/storageService';

/**
 * Placeholder type for StorageLocation
 * Will be replaced with actual type from storageService in Phase 2.1
 */
type StorageLocation = {
  id: string;
  name: string;
  type: 's3' | 'local';
  available: boolean;
  region?: string;
  path?: string;
};

/**
 * Placeholder type for FileEntry
 * Will be replaced with actual type from storageService in Phase 2.1
 */
type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: Date;
  target?: string;
};

/**
 * Placeholder type for TransferConflict
 * Will be replaced with actual type from storageService in Phase 2.1
 */
type TransferConflict = {
  path: string;
  existingSize: number;
  existingModified: Date;
};

/**
 * Mock storage locations for testing
 */
export const MOCK_STORAGE_LOCATIONS: StorageLocation[] = [
  {
    id: 's3-test-bucket',
    name: 'test-bucket',
    type: 's3',
    available: true,
    region: 'us-east-1'
  },
  {
    id: 'local-0',
    name: 'Data Storage',
    type: 'local',
    available: true,
    path: '/opt/app-root/src/data'
  },
  {
    id: 'local-1',
    name: 'Model Storage',
    type: 'local',
    available: true,
    path: '/opt/app-root/src/models'
  },
  {
    id: 'local-2',
    name: 'Unavailable Storage',
    type: 'local',
    available: false,
    path: '/mnt/missing'
  }
];

/**
 * Mock file entries for testing
 */
export const MOCK_FILE_ENTRIES: FileEntry[] = [
  {
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    size: 2048,
    modified: new Date('2025-10-20T10:00:00Z')
  },
  {
    name: 'data',
    path: 'data',
    type: 'directory'
  },
  {
    name: 'model.bin',
    path: 'model.bin',
    type: 'file',
    size: 7516192768, // 7GB
    modified: new Date('2025-10-22T15:30:00Z')
  },
  {
    name: 'link',
    path: 'link',
    type: 'symlink',
    target: 'data/actual-file.txt'
  }
];

/**
 * Mock transfer conflicts for testing
 */
export const MOCK_TRANSFER_CONFLICTS: TransferConflict[] = [
  {
    path: 'existing-file.txt',
    existingSize: 1024,
    existingModified: new Date('2025-10-15T08:00:00Z')
  },
  {
    path: 'another-file.pdf',
    existingSize: 5120,
    existingModified: new Date('2025-10-18T12:00:00Z')
  }
];

/**
 * Mock SSE transfer progress events
 */
export const MOCK_SSE_EVENTS = [
  {
    file: 'file1.txt',
    loaded: 0,
    total: 1024,
    status: 'queued'
  },
  {
    file: 'file1.txt',
    loaded: 512,
    total: 1024,
    status: 'transferring'
  },
  {
    file: 'file1.txt',
    loaded: 1024,
    total: 1024,
    status: 'completed'
  }
];
