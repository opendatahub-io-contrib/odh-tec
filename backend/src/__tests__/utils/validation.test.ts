/**
 * Comprehensive tests for input validation utilities
 */

import {
  validateBucketName,
  validateContinuationToken,
  validateQuery,
  validateAndDecodePrefix,
} from '../../utils/validation';

describe('validateBucketName', () => {
  describe('valid bucket names', () => {
    it('should accept valid bucket names', () => {
      const validNames = [
        'my-bucket',
        'test123',
        'a-b-c',
        'bucket-name-123',
        'test-bucket-2024',
        'ab1', // minimum length
        'a'.repeat(63), // maximum length
      ];

      validNames.forEach((name) => {
        expect(validateBucketName(name)).toBeNull();
      });
    });
  });

  describe('invalid bucket names - missing/type errors', () => {
    it('should reject undefined', () => {
      expect(validateBucketName(undefined)).toBe('Bucket name is required.');
    });

    it('should reject non-string values', () => {
      expect(validateBucketName(123 as any)).toBe('Bucket name is required.');
      expect(validateBucketName({} as any)).toBe('Bucket name is required.');
      expect(validateBucketName([] as any)).toBe('Bucket name is required.');
    });
  });

  describe('invalid bucket names - length violations', () => {
    it('should reject too short names', () => {
      expect(validateBucketName('')).toBe('Bucket name is required.');
      expect(validateBucketName('ab')).toBe('Bucket name must be between 3 and 63 characters.');
    });

    it('should reject too long names', () => {
      const tooLong = 'a'.repeat(64);
      expect(validateBucketName(tooLong)).toBe('Bucket name must be between 3 and 63 characters.');
    });
  });

  describe('invalid bucket names - format violations', () => {
    it('should reject uppercase letters', () => {
      expect(validateBucketName('My-Bucket')).toBe('Bucket name format is invalid.');
      expect(validateBucketName('TEST')).toBe('Bucket name format is invalid.');
    });

    it('should reject names starting with hyphen', () => {
      expect(validateBucketName('-bucket')).toBe('Bucket name format is invalid.');
    });

    it('should reject names ending with hyphen', () => {
      expect(validateBucketName('bucket-')).toBe('Bucket name format is invalid.');
    });

    it('should reject special characters', () => {
      expect(validateBucketName('bucket_name')).toBe('Bucket name format is invalid.');
      expect(validateBucketName('bucket.name')).toBe('Bucket name format is invalid.');
      expect(validateBucketName('bucket@name')).toBe('Bucket name format is invalid.');
      expect(validateBucketName('bucket name')).toBe('Bucket name format is invalid.');
    });
  });

  describe('invalid bucket names - reserved patterns', () => {
    it('should reject xn-- prefix (internationalized domains)', () => {
      expect(validateBucketName('xn--test')).toBe('Bucket name contains invalid patterns.');
      expect(validateBucketName('xn--bucket-123')).toBe('Bucket name contains invalid patterns.');
    });

    it('should reject consecutive hyphens', () => {
      expect(validateBucketName('bucket--name')).toBe('Bucket name contains invalid patterns.');
      expect(validateBucketName('test---bucket')).toBe('Bucket name contains invalid patterns.');
    });

    it('should reject IP address format', () => {
      // IP addresses with dots will fail the basic format check first (dots not allowed)
      expect(validateBucketName('192.168.1.1')).toBe('Bucket name format is invalid.');
      expect(validateBucketName('10.0.0.1')).toBe('Bucket name format is invalid.');
    });
  });
});

describe('validateQuery', () => {
  describe('valid queries', () => {
    it('should accept undefined (optional parameter)', () => {
      expect(validateQuery(undefined)).toBeNull();
    });

    it('should accept valid query strings', () => {
      const validQueries = [
        'test',
        'my-query',
        'test_123',
        'test.file',
        'query with spaces',
        'a', // minimum length
        'a'.repeat(256), // maximum length
        'MixedCase123',
        'file-name_v2.txt',
      ];

      validQueries.forEach((query) => {
        expect(validateQuery(query)).toBeNull();
      });
    });
  });

  describe('invalid queries - type errors', () => {
    it('should reject non-string values', () => {
      expect(validateQuery(123 as any)).toBe('Query must be a string.');
      expect(validateQuery({} as any)).toBe('Query must be a string.');
      expect(validateQuery([] as any)).toBe('Query must be a string.');
    });
  });

  describe('invalid queries - length violations', () => {
    it('should reject empty string', () => {
      expect(validateQuery('')).toBe('Query length must be between 1 and 256 characters.');
    });

    it('should reject too long queries', () => {
      const tooLong = 'a'.repeat(257);
      expect(validateQuery(tooLong)).toBe('Query length must be between 1 and 256 characters.');
    });
  });

  describe('invalid queries - special characters', () => {
    it('should reject HTML/script tags', () => {
      expect(validateQuery('<script>')).toBe('Query contains invalid characters.');
      expect(validateQuery('<div>')).toBe('Query contains invalid characters.');
    });

    it('should reject path traversal sequences', () => {
      expect(validateQuery('../../etc')).toBe('Query contains invalid characters.');
      expect(validateQuery('../passwd')).toBe('Query contains invalid characters.');
    });

    it('should reject special characters not in allowlist', () => {
      expect(validateQuery('test()')).toBe('Query contains invalid characters.');
      expect(validateQuery('test+query')).toBe('Query contains invalid characters.');
      expect(validateQuery('test=value')).toBe('Query contains invalid characters.');
      expect(validateQuery('test/path')).toBe('Query contains invalid characters.');
      expect(validateQuery('test:value')).toBe('Query contains invalid characters.');
      expect(validateQuery('test@example')).toBe('Query contains invalid characters.');
      expect(validateQuery('test[0]')).toBe('Query contains invalid characters.');
    });
  });
});

describe('validateContinuationToken', () => {
  describe('valid tokens', () => {
    it('should accept undefined (optional parameter)', () => {
      expect(validateContinuationToken(undefined)).toBeNull();
    });

    it('should accept valid base64-like tokens', () => {
      const validTokens = [
        'abc123',
        'AbC123',
        'token+value',
        'token/value',
        'token=value',
        'token-value',
        'token_value',
        'a', // minimum length
        'a'.repeat(512), // maximum length
        'SGVsbG8gV29ybGQ=', // actual base64
        'dGVzdC10b2tlbi0xMjM0NTY=',
      ];

      validTokens.forEach((token) => {
        expect(validateContinuationToken(token)).toBeNull();
      });
    });
  });

  describe('invalid tokens - type errors', () => {
    it('should reject non-string values', () => {
      expect(validateContinuationToken(123 as any)).toBe('Continuation token must be a string.');
      expect(validateContinuationToken({} as any)).toBe('Continuation token must be a string.');
      expect(validateContinuationToken([] as any)).toBe('Continuation token must be a string.');
    });
  });

  describe('invalid tokens - length violations', () => {
    it('should reject empty string', () => {
      expect(validateContinuationToken('')).toBe('Continuation token length is invalid.');
    });

    it('should reject too long tokens', () => {
      const tooLong = 'a'.repeat(513);
      expect(validateContinuationToken(tooLong)).toBe('Continuation token length is invalid.');
    });
  });

  describe('invalid tokens - format violations', () => {
    it('should reject tokens with spaces', () => {
      expect(validateContinuationToken('token with spaces')).toBe(
        'Continuation token format is invalid.',
      );
    });

    it('should reject tokens with special characters', () => {
      expect(validateContinuationToken('token<script>')).toBe(
        'Continuation token format is invalid.',
      );
      expect(validateContinuationToken('token@value')).toBe(
        'Continuation token format is invalid.',
      );
      expect(validateContinuationToken('token#value')).toBe(
        'Continuation token format is invalid.',
      );
      expect(validateContinuationToken('token$value')).toBe(
        'Continuation token format is invalid.',
      );
    });
  });
});

describe('validateAndDecodePrefix', () => {
  describe('valid prefixes', () => {
    it('should accept undefined (optional parameter)', () => {
      const result = validateAndDecodePrefix(undefined);
      expect(result.decoded).toBe('');
      expect(result.error).toBeNull();
    });

    it('should decode valid base64 prefixes', () => {
      const validPrefixes = [
        { encoded: btoa('test/path'), expected: 'test/path' },
        { encoded: btoa('folder'), expected: 'folder' },
        { encoded: btoa(''), expected: '' },
        { encoded: btoa('models/llama-2'), expected: 'models/llama-2' },
      ];

      validPrefixes.forEach(({ encoded, expected }) => {
        const result = validateAndDecodePrefix(encoded);
        expect(result.decoded).toBe(expected);
        expect(result.error).toBeNull();
      });
    });
  });

  describe('invalid prefixes - type/length errors', () => {
    it('should reject non-string values', () => {
      const result = validateAndDecodePrefix(123 as any);
      expect(result.decoded).toBe('');
      expect(result.error).toBe('Prefix parameter is invalid.');
    });

    it('should reject too long encoded prefixes', () => {
      const tooLong = 'a'.repeat(2049);
      const result = validateAndDecodePrefix(tooLong);
      expect(result.decoded).toBe('');
      expect(result.error).toBe('Prefix parameter is invalid.');
    });
  });

  describe('invalid prefixes - encoding errors', () => {
    it('should reject invalid base64', () => {
      // Test with strings that will actually fail atob()
      const invalidBase64 = [
        '!!!invalid!!!', // Invalid characters
        '@@@@', // Invalid characters
        'test\ntest', // Contains newline
      ];

      invalidBase64.forEach((invalid) => {
        const result = validateAndDecodePrefix(invalid);
        expect(result.decoded).toBe('');
        expect(result.error).toBe('Prefix is not valid base64.');
      });
    });

    it('should reject too long decoded prefixes', () => {
      const longString = 'a'.repeat(1025);
      const encoded = btoa(longString);
      const result = validateAndDecodePrefix(encoded);
      expect(result.decoded).toBe('');
      expect(result.error).toBe('Decoded prefix is too long.');
    });
  });

  describe('invalid prefixes - path traversal', () => {
    it('should reject path traversal sequences', () => {
      const pathTraversalAttacks = [
        '../../etc/passwd',
        '../../../root',
        'folder/../../etc',
        'test/../../../passwd',
      ];

      pathTraversalAttacks.forEach((attack) => {
        const encoded = btoa(attack);
        const result = validateAndDecodePrefix(encoded);
        expect(result.decoded).toBe('');
        expect(result.error).toBe('Prefix contains invalid characters.');
      });
    });

    it('should reject null bytes', () => {
      const nullByteAttacks = ['test\0null', 'folder\0', '\0test'];

      nullByteAttacks.forEach((attack) => {
        const encoded = btoa(attack);
        const result = validateAndDecodePrefix(encoded);
        expect(result.decoded).toBe('');
        expect(result.error).toBe('Prefix contains invalid characters.');
      });
    });
  });
});
