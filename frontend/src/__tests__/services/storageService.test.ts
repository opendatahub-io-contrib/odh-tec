import axios from 'axios';
import { storageService, StorageLocation, FileEntry } from '@app/services/storageService';
import config from '@app/config';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLocations', () => {
    it('should fetch and normalize both S3 and local locations', async () => {
      const s3Buckets = {
        data: {
          buckets: [
            { Name: 'bucket1', Region: 'us-east-1', CreationDate: '2024-01-01' },
            { Name: 'bucket2', Region: 'us-west-2', CreationDate: '2024-01-02' },
          ],
        },
      };

      const localLocations = {
        data: {
          locations: [
            { id: 'local-0', name: 'Data Storage', type: 'local', available: true, path: '/mnt/data' },
            { id: 'local-1', name: 'Model Storage', type: 'local', available: false, path: '/mnt/models' },
          ],
        },
      };

      mockedAxios.get.mockResolvedValueOnce(s3Buckets).mockResolvedValueOnce(localLocations);

      const locations = await storageService.getLocations();

      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${config.backend_api_url}/buckets`);
      expect(mockedAxios.get).toHaveBeenCalledWith(`${config.backend_api_url}/local/locations`);

      expect(locations).toHaveLength(4);

      // Check S3 locations
      expect(locations[0]).toEqual({
        id: 'bucket1',
        name: 'bucket1',
        type: 's3',
        available: true,
        region: 'us-east-1',
      });

      expect(locations[1]).toEqual({
        id: 'bucket2',
        name: 'bucket2',
        type: 's3',
        available: true,
        region: 'us-west-2',
      });

      // Check local locations
      expect(locations[2]).toEqual({
        id: 'local-0',
        name: 'Data Storage',
        type: 'local',
        available: true,
        path: '/mnt/data',
      });

      expect(locations[3]).toEqual({
        id: 'local-1',
        name: 'Model Storage',
        type: 'local',
        available: false,
        path: '/mnt/models',
      });
    });

    it('should throw error if API call fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(storageService.getLocations()).rejects.toThrow('Network error');
    });
  });

  describe('listFiles', () => {
    beforeEach(() => {
      // Mock getLocation for all listFiles tests
      const s3Locations = {
        data: {
          buckets: [{ Name: 'bucket1', Region: 'us-east-1' }],
        },
      };

      const localLocations = {
        data: {
          locations: [{ id: 'local-0', name: 'Data Storage', type: 'local', available: true }],
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(s3Locations)
        .mockResolvedValueOnce(localLocations);
    });

    it('should list S3 files and normalize them', async () => {
      const s3Objects = {
        data: {
          objects: [
            { Key: 'file1.txt', Size: 1024, LastModified: '2024-01-01T00:00:00Z' },
            { Key: 'folder/', Size: 0, LastModified: '2024-01-02T00:00:00Z' },
          ],
          totalCount: 2,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(s3Objects);

      const result = await storageService.listFiles('bucket1', 'path/to/');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${config.backend_api_url}/objects/bucket1`,
        {
          params: { prefix: 'path/to/', limit: undefined, offset: undefined },
        },
      );

      expect(result.files).toHaveLength(2);
      expect(result.totalCount).toBe(2);

      expect(result.files[0]).toEqual({
        name: 'file1.txt',
        path: 'file1.txt',
        type: 'file',
        size: 1024,
        modified: new Date('2024-01-01T00:00:00Z'),
      });

      expect(result.files[1]).toEqual({
        name: 'folder',
        path: 'folder/',
        type: 'directory',
        size: 0,
        modified: new Date('2024-01-02T00:00:00Z'),
      });
    });

    it('should list local files and normalize them', async () => {
      const localFiles = {
        data: {
          files: [
            {
              name: 'file1.txt',
              path: 'path/to/file1.txt',
              type: 'file',
              size: 2048,
              modified: '2024-01-01T00:00:00Z',
            },
            {
              name: 'link',
              path: 'path/to/link',
              type: 'symlink',
              target: '../target',
            },
          ],
          totalCount: 2,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(localFiles);

      const result = await storageService.listFiles('local-0', 'path/to/');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${config.backend_api_url}/local/files/local-0/path/to/`,
        {
          params: { limit: undefined, offset: undefined },
        },
      );

      expect(result.files).toHaveLength(2);
      expect(result.totalCount).toBe(2);

      expect(result.files[0]).toEqual({
        name: 'file1.txt',
        path: 'path/to/file1.txt',
        type: 'file',
        size: 2048,
        modified: new Date('2024-01-01T00:00:00Z'),
        target: undefined,
      });

      expect(result.files[1]).toEqual({
        name: 'link',
        path: 'path/to/link',
        type: 'symlink',
        size: undefined,
        modified: undefined,
        target: '../target',
      });
    });

    it('should throw error if location not found', async () => {
      await expect(storageService.listFiles('nonexistent', '')).rejects.toThrow(
        'Location not found: nonexistent',
      );
    });
  });

  describe('uploadFile', () => {
    beforeEach(() => {
      const s3Locations = {
        data: {
          buckets: [{ Name: 'bucket1', Region: 'us-east-1' }],
        },
      };

      const localLocations = {
        data: {
          locations: [{ id: 'local-0', name: 'Data Storage', type: 'local', available: true }],
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(s3Locations)
        .mockResolvedValueOnce(localLocations);
    });

    it('should upload file to S3', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { uploaded: true } });

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      await storageService.uploadFile('bucket1', 'path/to/test.txt', file);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/objects/bucket1/path/to/test.txt`,
        expect.any(FormData),
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
    });

    it('should upload file to local storage', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { uploaded: true } });

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      await storageService.uploadFile('local-0', 'path/to/test.txt', file);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/local/files/local-0/path/to/test.txt`,
        expect.any(FormData),
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
    });
  });

  describe('deleteFile', () => {
    beforeEach(() => {
      const s3Locations = {
        data: {
          buckets: [{ Name: 'bucket1', Region: 'us-east-1' }],
        },
      };

      const localLocations = {
        data: {
          locations: [{ id: 'local-0', name: 'Data Storage', type: 'local', available: true }],
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(s3Locations)
        .mockResolvedValueOnce(localLocations);
    });

    it('should delete S3 file', async () => {
      mockedAxios.delete.mockResolvedValueOnce({ data: { deleted: true } });

      await storageService.deleteFile('bucket1', 'path/to/file.txt');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        `${config.backend_api_url}/objects/bucket1/path/to/file.txt`,
      );
    });

    it('should delete local file', async () => {
      mockedAxios.delete.mockResolvedValueOnce({ data: { deleted: true } });

      await storageService.deleteFile('local-0', 'path/to/file.txt');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        `${config.backend_api_url}/local/files/local-0/path/to/file.txt`,
      );
    });
  });

  describe('createDirectory', () => {
    beforeEach(() => {
      const s3Locations = {
        data: {
          buckets: [{ Name: 'bucket1', Region: 'us-east-1' }],
        },
      };

      const localLocations = {
        data: {
          locations: [{ id: 'local-0', name: 'Data Storage', type: 'local', available: true }],
        },
      };

      mockedAxios.get
        .mockResolvedValueOnce(s3Locations)
        .mockResolvedValueOnce(localLocations);
    });

    it('should create S3 directory marker', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { created: true } });

      await storageService.createDirectory('bucket1', 'path/to/folder');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/objects/bucket1/path/to/folder/`,
      );
    });

    it('should create local directory', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { created: true } });

      await storageService.createDirectory('local-0', 'path/to/folder');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/local/directories/local-0/path/to/folder`,
      );
    });
  });

  describe('checkConflicts', () => {
    it('should check for file conflicts', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          conflicts: ['file1.txt', 'file2.txt'],
        },
      });

      const conflicts = await storageService.checkConflicts(
        { type: 'local', locationId: 'local-0', path: 'dest/' },
        ['file1.txt', 'file2.txt', 'file3.txt'],
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/transfer/check-conflicts`,
        {
          destination: { type: 'local', locationId: 'local-0', path: 'dest/' },
          files: ['file1.txt', 'file2.txt', 'file3.txt'],
        },
      );

      expect(conflicts).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('initiateTransfer', () => {
    it('should initiate cross-storage transfer', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          jobId: 'job-123',
          sseUrl: '/api/transfer/progress/job-123',
        },
      });

      const request = {
        source: { type: 's3' as const, locationId: 'bucket1', path: 'source/' },
        destination: { type: 'local' as const, locationId: 'local-0', path: 'dest/' },
        files: ['file1.txt', 'file2.txt'],
        conflictResolution: 'rename' as const,
      };

      const response = await storageService.initiateTransfer(request);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.backend_api_url}/transfer`,
        request,
      );

      expect(response).toEqual({
        jobId: 'job-123',
        sseUrl: '/api/transfer/progress/job-123',
      });
    });
  });

  describe('cancelTransfer', () => {
    it('should cancel transfer job', async () => {
      mockedAxios.delete.mockResolvedValueOnce({ data: { cancelled: true } });

      await storageService.cancelTransfer('job-123');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        `${config.backend_api_url}/transfer/job-123`,
      );
    });
  });
});
