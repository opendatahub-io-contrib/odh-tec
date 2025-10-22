import {
  getLocalStoragePaths,
  getMaxFileSizeGB,
  getMaxFileSizeBytes,
  updateLocalStoragePaths,
  updateMaxFileSizeGB,
  isFileSizeValid,
  formatFileSize,
  getMaxConcurrentTransfers,
  getS3Config,
  updateS3Config,
  getHFConfig,
  updateHFConfig,
  getProxyConfig,
  updateProxyConfig,
  updateMaxConcurrentTransfers,
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
    it('should return value from environment variable', () => {
      const limit = getMaxConcurrentTransfers();
      // The value will be whatever was set at initialization (default: 2)
      expect(typeof limit).toBe('number');
    });

    it('should update max concurrent transfers at runtime', () => {
      updateMaxConcurrentTransfers(10);
      expect(getMaxConcurrentTransfers()).toBe(10);
      // Reset to default
      updateMaxConcurrentTransfers(2);
    });
  });

  describe('S3 Configuration', () => {
    it('should get S3 configuration', () => {
      const config = getS3Config();
      expect(config).toHaveProperty('accessKeyId');
      expect(config).toHaveProperty('secretAccessKey');
      expect(config).toHaveProperty('region');
      expect(config).toHaveProperty('endpoint');
      expect(config).toHaveProperty('defaultBucket');
      expect(config).toHaveProperty('s3Client');
    });

    it('should update S3 configuration', () => {
      updateS3Config(
        'newKeyId',
        'newSecret',
        'us-west-2',
        'https://new-endpoint.com',
        'new-bucket',
      );
      const config = getS3Config();
      expect(config.accessKeyId).toBe('newKeyId');
      expect(config.secretAccessKey).toBe('newSecret');
      expect(config.region).toBe('us-west-2');
      expect(config.endpoint).toBe('https://new-endpoint.com');
      expect(config.defaultBucket).toBe('new-bucket');
    });
  });

  describe('HuggingFace Configuration', () => {
    it('should get HF token', () => {
      const token = getHFConfig();
      expect(typeof token).toBe('string');
    });

    it('should update HF token', () => {
      updateHFConfig('hf_newtesttoken');
      expect(getHFConfig()).toBe('hf_newtesttoken');
    });
  });

  describe('Proxy Configuration', () => {
    it('should get proxy configuration', () => {
      const config = getProxyConfig();
      expect(config).toHaveProperty('httpProxy');
      expect(config).toHaveProperty('httpsProxy');
    });

    it('should update proxy configuration', () => {
      updateProxyConfig('http://proxy1:3128', 'http://proxy2:3128');
      const config = getProxyConfig();
      expect(config.httpProxy).toBe('http://proxy1:3128');
      expect(config.httpsProxy).toBe('http://proxy2:3128');
    });
  });

  describe('Environment variable parsing edge cases', () => {
    it('should handle invalid MAX_FILE_SIZE_GB', () => {
      const originalValue = process.env.MAX_FILE_SIZE_GB;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      process.env.MAX_FILE_SIZE_GB = 'invalid';
      jest.resetModules();
      const { getMaxFileSizeGB: getSizeFresh } = require('../../utils/config');

      expect(getSizeFresh()).toBe(20);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
      process.env.MAX_FILE_SIZE_GB = originalValue;
      jest.resetModules();
    });

    it('should handle negative MAX_FILE_SIZE_GB', () => {
      const originalValue = process.env.MAX_FILE_SIZE_GB;
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      process.env.MAX_FILE_SIZE_GB = '-5';
      jest.resetModules();
      const { getMaxFileSizeGB: getSizeFresh } = require('../../utils/config');

      expect(getSizeFresh()).toBe(20);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
      process.env.MAX_FILE_SIZE_GB = originalValue;
      jest.resetModules();
    });

    it('should filter empty paths from LOCAL_STORAGE_PATHS environment', () => {
      const originalValue = process.env.LOCAL_STORAGE_PATHS;
      process.env.LOCAL_STORAGE_PATHS = '/path1,,/path2,  ,/path3';

      jest.resetModules();
      const { getLocalStoragePaths: getPathsFresh } = require('../../utils/config');

      const paths = getPathsFresh();
      expect(paths).toEqual(['/path1', '/path2', '/path3']);

      process.env.LOCAL_STORAGE_PATHS = originalValue;
      jest.resetModules();
    });
  });
});
