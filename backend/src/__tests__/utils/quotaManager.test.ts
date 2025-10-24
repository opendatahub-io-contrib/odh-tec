import { initializeQuota, checkQuota, updateQuota, getQuotaStatus } from '../../utils/quotaManager';

describe('Quota Manager', () => {
  const testLocationId = 'local-0';
  const testLocationId2 = 'local-1';

  // Reset quota store before each test by re-importing
  beforeEach(() => {
    jest.resetModules();
  });

  describe('initializeQuota', () => {
    it('should initialize quota for a location', () => {
      const {
        initializeQuota: init,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      init(testLocationId);
      const status = getStatus(testLocationId);

      expect(status.maxStorageBytes).toBe(100 * 1024 * 1024 * 1024); // 100 GB
      expect(status.maxFileCount).toBe(10000);
      expect(status.currentStorageBytes).toBe(0);
      expect(status.currentFileCount).toBe(0);
    });

    it('should not reinitialize existing quota', () => {
      const {
        initializeQuota: init,
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      init(testLocationId);
      update(testLocationId, 1000, 5);

      // Try to initialize again
      init(testLocationId);
      const status = getStatus(testLocationId);

      // Should preserve existing values
      expect(status.currentStorageBytes).toBe(1000);
      expect(status.currentFileCount).toBe(5);
    });

    it('should initialize multiple locations independently', () => {
      const {
        initializeQuota: init,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      init(testLocationId);
      init(testLocationId2);

      const status1 = getStatus(testLocationId);
      const status2 = getStatus(testLocationId2);

      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2); // Different objects
    });
  });

  describe('checkQuota', () => {
    it('should allow operation within quota', () => {
      const { checkQuota: check } = require('../../utils/quotaManager');

      const result = check(testLocationId, 1000, 1);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject operation exceeding storage quota', () => {
      const { checkQuota: check } = require('../../utils/quotaManager');

      const tooLarge = 101 * 1024 * 1024 * 1024; // 101 GB (over 100 GB limit)
      const result = check(testLocationId, tooLarge, 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
      expect(result.reason).toContain('remaining');
    });

    it('should reject operation exceeding file count quota', () => {
      const { checkQuota: check } = require('../../utils/quotaManager');

      const result = check(testLocationId, 1000, 10001);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('File count quota exceeded');
      expect(result.reason).toContain('files remaining');
    });

    it('should account for current usage when checking quota', () => {
      const { checkQuota: check, updateQuota: update } = require('../../utils/quotaManager');

      // Use up most of the storage quota
      update(testLocationId, 99 * 1024 * 1024 * 1024, 1); // 99 GB

      // Try to add 2 more GB (would exceed 100 GB limit)
      const result = check(testLocationId, 2 * 1024 * 1024 * 1024, 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Storage quota exceeded');
    });

    it('should allow operation at exact quota limit', () => {
      const { checkQuota: check } = require('../../utils/quotaManager');

      const exactLimit = 100 * 1024 * 1024 * 1024; // Exactly 100 GB
      const result = check(testLocationId, exactLimit, 1);

      expect(result.allowed).toBe(true);
    });
  });

  describe('updateQuota', () => {
    it('should increase quota usage', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 5000, 3);
      const status = getStatus(testLocationId);

      expect(status.currentStorageBytes).toBe(5000);
      expect(status.currentFileCount).toBe(3);
    });

    it('should decrease quota usage with negative values', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 5000, 3);
      update(testLocationId, -2000, -1);

      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(3000);
      expect(status.currentFileCount).toBe(2);
    });

    it('should accumulate multiple updates', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 1000, 1);
      update(testLocationId, 2000, 2);
      update(testLocationId, 3000, 3);

      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(6000);
      expect(status.currentFileCount).toBe(6);
    });

    it('should prevent negative storage bytes', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 1000, 5);
      update(testLocationId, -2000, -3); // Would be -1000, but should clamp to 0

      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(0);
      expect(status.currentFileCount).toBe(2);
    });

    it('should prevent negative file count', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 1000, 5);
      update(testLocationId, -500, -10); // Would be -5, but should clamp to 0

      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(500);
      expect(status.currentFileCount).toBe(0);
    });

    it('should update locations independently', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 1000, 1);
      update(testLocationId2, 2000, 2);

      const status1 = getStatus(testLocationId);
      const status2 = getStatus(testLocationId2);

      expect(status1.currentStorageBytes).toBe(1000);
      expect(status1.currentFileCount).toBe(1);
      expect(status2.currentStorageBytes).toBe(2000);
      expect(status2.currentFileCount).toBe(2);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return current quota status', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      update(testLocationId, 50000, 25);
      const status = getStatus(testLocationId);

      expect(status).toEqual({
        maxStorageBytes: 100 * 1024 * 1024 * 1024,
        maxFileCount: 10000,
        currentStorageBytes: 50000,
        currentFileCount: 25,
      });
    });

    it('should return a copy of quota status', () => {
      const { getQuotaStatus: getStatus } = require('../../utils/quotaManager');

      const status1 = getStatus(testLocationId);
      const status2 = getStatus(testLocationId);

      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2); // Different objects

      // Modifying one shouldn't affect the other
      status1.currentStorageBytes = 999999;
      expect(status2.currentStorageBytes).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle typical upload workflow', () => {
      const {
        checkQuota: check,
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      // Check quota before upload
      const preCheck = check(testLocationId, 10000, 1);
      expect(preCheck.allowed).toBe(true);

      // Simulate successful upload
      update(testLocationId, 10000, 1);

      // Verify quota updated
      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(10000);
      expect(status.currentFileCount).toBe(1);
    });

    it('should handle typical delete workflow', () => {
      const {
        updateQuota: update,
        getQuotaStatus: getStatus,
      } = require('../../utils/quotaManager');

      // Simulate existing files
      update(testLocationId, 30000, 3);

      // Simulate delete
      update(testLocationId, -10000, -1);

      const status = getStatus(testLocationId);
      expect(status.currentStorageBytes).toBe(20000);
      expect(status.currentFileCount).toBe(2);
    });

    it('should prevent upload when quota full', () => {
      const { checkQuota: check, updateQuota: update } = require('../../utils/quotaManager');

      // Fill quota to limit
      update(testLocationId, 100 * 1024 * 1024 * 1024, 5000);

      // Try to upload more
      const result = check(testLocationId, 1000, 1);
      expect(result.allowed).toBe(false);
    });
  });
});
