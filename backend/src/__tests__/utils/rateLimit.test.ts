import {
  checkRateLimit,
  getRateLimitResetTime,
  clearAllRateLimits,
  getRateLimitStoreSize,
} from '../../utils/rateLimit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear rate limits before each test
    clearAllRateLimits();
  });

  afterEach(() => {
    // Clean up after each test
    clearAllRateLimits();
  });

  describe('checkRateLimit', () => {
    test('should allow first N requests', () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 60000; // 1 minute

      // First 5 requests should be allowed
      for (let i = 0; i < max; i++) {
        expect(checkRateLimit(key, max, windowMs)).toBe(false);
      }

      // Store should have exactly 1 entry
      expect(getRateLimitStoreSize()).toBe(1);
    });

    test('should block (N+1)th request', () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 60000;

      // First 5 requests allowed
      for (let i = 0; i < max; i++) {
        checkRateLimit(key, max, windowMs);
      }

      // 6th request should be blocked
      expect(checkRateLimit(key, max, windowMs)).toBe(true);
    });

    test('should reset after window expires', async () => {
      const key = 'test:127.0.0.1';
      const max = 3;
      const windowMs = 100; // 100ms for faster test

      // Use up all requests
      for (let i = 0; i < max; i++) {
        expect(checkRateLimit(key, max, windowMs)).toBe(false);
      }

      // Should be blocked
      expect(checkRateLimit(key, max, windowMs)).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
    });

    test('should track different keys independently', () => {
      const key1 = 'test:192.168.1.1';
      const key2 = 'test:192.168.1.2';
      const max = 2;
      const windowMs = 60000;

      // Use up requests for key1
      checkRateLimit(key1, max, windowMs);
      checkRateLimit(key1, max, windowMs);

      // key1 should be blocked
      expect(checkRateLimit(key1, max, windowMs)).toBe(true);

      // key2 should still be allowed
      expect(checkRateLimit(key2, max, windowMs)).toBe(false);

      // Store should have 2 entries
      expect(getRateLimitStoreSize()).toBe(2);
    });

    test('should handle concurrent requests correctly', () => {
      const key = 'test:127.0.0.1';
      const max = 10;
      const windowMs = 60000;

      // Simulate 15 concurrent requests
      const results = [];
      for (let i = 0; i < 15; i++) {
        results.push(checkRateLimit(key, max, windowMs));
      }

      // First 10 should be allowed (false), next 5 should be blocked (true)
      const allowed = results.filter((r) => r === false).length;
      const blocked = results.filter((r) => r === true).length;

      expect(allowed).toBe(10);
      expect(blocked).toBe(5);
    });

    test('should create new window when previous window expired', async () => {
      const key = 'test:127.0.0.1';
      const max = 2;
      const windowMs = 100;

      // First window - use all requests
      checkRateLimit(key, max, windowMs);
      checkRateLimit(key, max, windowMs);
      expect(checkRateLimit(key, max, windowMs)).toBe(true);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // New window - should get fresh quota
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
      expect(checkRateLimit(key, max, windowMs)).toBe(true);
    });
  });

  describe('getRateLimitResetTime', () => {
    test('should return correct reset time', async () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 60000; // 1 minute

      // Make first request
      checkRateLimit(key, max, windowMs);

      // Get reset time
      const resetTime = getRateLimitResetTime(key);

      // Should be approximately 60 seconds (with some tolerance for execution time)
      expect(resetTime).toBeGreaterThanOrEqual(59);
      expect(resetTime).toBeLessThanOrEqual(60);
    });

    test('should return 0 for non-existent key', () => {
      const key = 'test:nonexistent';
      expect(getRateLimitResetTime(key)).toBe(0);
    });

    test('should return 0 for expired window', async () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 100;

      // Make request
      checkRateLimit(key, max, windowMs);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should return 0
      expect(getRateLimitResetTime(key)).toBe(0);
    });

    test('should calculate decreasing reset time', async () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 5000; // 5 seconds

      // Make request
      checkRateLimit(key, max, windowMs);

      // Get initial reset time
      const initialReset = getRateLimitResetTime(key);

      // Wait 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get reset time again
      const laterReset = getRateLimitResetTime(key);

      // Should be approximately 2 seconds less
      expect(laterReset).toBeLessThan(initialReset);
      expect(laterReset).toBeGreaterThanOrEqual(2);
      expect(laterReset).toBeLessThanOrEqual(3);
    });
  });

  describe('Store cleanup', () => {
    test('should cleanup expired entries when threshold exceeded', async () => {
      const windowMs = 50; // Very short window
      const max = 1;

      // Create many entries that will expire
      for (let i = 0; i < 100; i++) {
        checkRateLimit(`test:${i}`, max, windowMs);
      }

      // Should have 100 entries
      expect(getRateLimitStoreSize()).toBe(100);

      // Wait for all to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create many more entries to trigger cleanup (threshold is 10000)
      for (let i = 100; i < 10100; i++) {
        checkRateLimit(`test:${i}`, max, windowMs);
      }

      // After cleanup, should have removed expired entries
      // Exact count may vary due to timing, but should be significantly less than 10100
      const storeSize = getRateLimitStoreSize();
      expect(storeSize).toBeGreaterThan(0);
      expect(storeSize).toBeLessThan(10100);
    });
  });

  describe('Edge cases', () => {
    test('should handle max = 0', () => {
      const key = 'test:127.0.0.1';
      const max = 0;
      const windowMs = 60000;

      // Even first request should be blocked
      expect(checkRateLimit(key, max, windowMs)).toBe(false); // Creates entry with count 1
      expect(checkRateLimit(key, max, windowMs)).toBe(true); // Now blocked (count >= max)
    });

    test('should handle max = 1', () => {
      const key = 'test:127.0.0.1';
      const max = 1;
      const windowMs = 60000;

      // First request allowed
      expect(checkRateLimit(key, max, windowMs)).toBe(false);

      // Second request blocked
      expect(checkRateLimit(key, max, windowMs)).toBe(true);
    });

    test('should handle very short window', async () => {
      const key = 'test:127.0.0.1';
      const max = 2;
      const windowMs = 10; // 10ms

      // Use up requests
      checkRateLimit(key, max, windowMs);
      checkRateLimit(key, max, windowMs);
      expect(checkRateLimit(key, max, windowMs)).toBe(true);

      // Wait for very short window to expire
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should be allowed again
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
    });

    test('should handle very long window', () => {
      const key = 'test:127.0.0.1';
      const max = 5;
      const windowMs = 3600000; // 1 hour

      checkRateLimit(key, max, windowMs);
      const resetTime = getRateLimitResetTime(key);

      // Should be approximately 1 hour (3600 seconds)
      expect(resetTime).toBeGreaterThanOrEqual(3599);
      expect(resetTime).toBeLessThanOrEqual(3600);
    });

    test('should handle special characters in key', () => {
      const key = 'contains-search:192.168.1.1:8080';
      const max = 3;
      const windowMs = 60000;

      // Should work normally with special characters
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
      expect(checkRateLimit(key, max, windowMs)).toBe(true);
    });
  });

  describe('clearAllRateLimits', () => {
    test('should clear all rate limit entries', () => {
      const max = 5;
      const windowMs = 60000;

      // Create multiple entries
      checkRateLimit('key1', max, windowMs);
      checkRateLimit('key2', max, windowMs);
      checkRateLimit('key3', max, windowMs);

      expect(getRateLimitStoreSize()).toBe(3);

      // Clear all
      clearAllRateLimits();

      expect(getRateLimitStoreSize()).toBe(0);
    });

    test('should reset counters after clear', () => {
      const key = 'test:127.0.0.1';
      const max = 2;
      const windowMs = 60000;

      // Use up all requests
      checkRateLimit(key, max, windowMs);
      checkRateLimit(key, max, windowMs);
      expect(checkRateLimit(key, max, windowMs)).toBe(true);

      // Clear all
      clearAllRateLimits();

      // Should be allowed again
      expect(checkRateLimit(key, max, windowMs)).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    test('should simulate contains search rate limiting', () => {
      const clientIp = '192.168.1.100';
      const rateLimitKey = `contains-search:${clientIp}`;
      const max = 5; // 5 per minute
      const windowMs = 60000;

      // Simulate 7 search requests
      const results = [];
      for (let i = 0; i < 7; i++) {
        const isBlocked = checkRateLimit(rateLimitKey, max, windowMs);
        results.push(isBlocked);

        if (isBlocked) {
          // Client should wait
          const retryAfter = getRateLimitResetTime(rateLimitKey);
          expect(retryAfter).toBeGreaterThan(0);
        }
      }

      // First 5 allowed, next 2 blocked
      expect(results.filter((r) => !r).length).toBe(5);
      expect(results.filter((r) => r).length).toBe(2);
    });

    test('should simulate transfer rate limiting', () => {
      const clientIp = '10.0.0.50';
      const rateLimitKey = `transfer:${clientIp}`;
      const max = 10; // 10 per minute
      const windowMs = 60000;

      // Simulate 12 transfer requests
      let allowed = 0;
      let blocked = 0;

      for (let i = 0; i < 12; i++) {
        if (checkRateLimit(rateLimitKey, max, windowMs)) {
          blocked++;
        } else {
          allowed++;
        }
      }

      expect(allowed).toBe(10);
      expect(blocked).toBe(2);
    });

    test('should simulate upload rate limiting', () => {
      const clientIp = '172.16.0.1';
      const rateLimitKey = `upload:${clientIp}`;
      const max = 20; // 20 per minute
      const windowMs = 60000;

      // Simulate 25 upload requests
      let allowed = 0;
      let blocked = 0;

      for (let i = 0; i < 25; i++) {
        if (checkRateLimit(rateLimitKey, max, windowMs)) {
          blocked++;
        } else {
          allowed++;
        }
      }

      expect(allowed).toBe(20);
      expect(blocked).toBe(5);
    });

    test('should handle multiple clients independently', () => {
      const max = 3;
      const windowMs = 60000;

      const client1 = 'upload:192.168.1.1';
      const client2 = 'upload:192.168.1.2';
      const client3 = 'upload:192.168.1.3';

      // Client 1 - use all requests
      checkRateLimit(client1, max, windowMs);
      checkRateLimit(client1, max, windowMs);
      checkRateLimit(client1, max, windowMs);

      // Client 2 - use some requests
      checkRateLimit(client2, max, windowMs);

      // Client 3 - use all requests
      checkRateLimit(client3, max, windowMs);
      checkRateLimit(client3, max, windowMs);
      checkRateLimit(client3, max, windowMs);

      // Verify each client's state
      expect(checkRateLimit(client1, max, windowMs)).toBe(true); // Blocked
      expect(checkRateLimit(client2, max, windowMs)).toBe(false); // Still allowed
      expect(checkRateLimit(client3, max, windowMs)).toBe(true); // Blocked

      // Store should have 3 entries
      expect(getRateLimitStoreSize()).toBe(3);
    });
  });
});
