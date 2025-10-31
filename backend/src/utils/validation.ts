/**
 * Input validation utilities for ODH-TEC API
 *
 * Provides secure validation functions for user inputs to prevent
 * injection attacks, path traversal, and other security vulnerabilities.
 */

/**
 * Validates S3 bucket name according to AWS naming rules.
 *
 * AWS S3 bucket naming rules:
 * - Between 3-63 characters
 * - Only lowercase letters, numbers, and hyphens
 * - Must start and end with a letter or number
 * - Cannot contain consecutive hyphens
 * - Cannot be formatted as an IP address
 * - Cannot start with 'xn--' (reserved for internationalized domain names)
 *
 * @param bucketName - Bucket name to validate
 * @returns null if valid, error message string if invalid
 */
export function validateBucketName(bucketName: string | undefined): string | null {
  if (!bucketName || typeof bucketName !== 'string') {
    return 'Bucket name is required.';
  }

  // Empty string check (treated as missing)
  if (bucketName === '') {
    return 'Bucket name is required.';
  }

  // Length check: 3-63 characters
  if (bucketName.length < 3 || bucketName.length > 63) {
    return 'Bucket name must be between 3 and 63 characters.';
  }

  // Basic pattern: lowercase alphanumeric and hyphens, must start/end with alphanumeric
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(bucketName)) {
    return 'Bucket name format is invalid.';
  }

  // AWS reserved patterns and invalid formats
  const invalidPatterns = [
    /^xn--/, // AWS reserved prefix (internationalized domains)
    /--/, // Consecutive hyphens not allowed
    /^\d+\.\d+\./, // IP address-like format (e.g., 192.168.1.1)
  ];

  if (invalidPatterns.some((pattern) => pattern.test(bucketName))) {
    return 'Bucket name contains invalid patterns.';
  }

  return null; // Valid
}

/**
 * Validates search query parameter.
 *
 * Query validation rules:
 * - Optional parameter (returns null if not provided)
 * - Must be a string
 * - Length between 1-256 characters
 * - Only allows: letters, numbers, dots, hyphens, underscores, spaces
 * - More restrictive than original QUERY_PATTERN to prevent injection
 *
 * @param q - Query string to validate
 * @returns null if valid, error message string if invalid
 */
export function validateQuery(q: string | undefined): string | null {
  if (q === undefined) {
    return null; // Optional parameter
  }

  if (typeof q !== 'string') {
    return 'Query must be a string.';
  }

  if (q.length === 0 || q.length > 256) {
    return 'Query length must be between 1 and 256 characters.';
  }

  // Restrictive pattern: alphanumeric, dot, dash, underscore, space only
  // Explicitly excludes: ()+=/:@[] and other special characters
  if (!/^[a-zA-Z0-9._\-\s]{1,256}$/.test(q)) {
    return 'Query contains invalid characters.';
  }

  return null; // Valid
}

/**
 * Validates S3 continuation token format.
 *
 * Continuation tokens are used for pagination in S3 ListObjects operations.
 * They are base64-like strings returned by AWS.
 *
 * Validation rules:
 * - Optional parameter (returns null if not provided)
 * - Must be a string
 * - Length between 1-512 characters (reduced from original 1024)
 * - Must match base64-like format: [A-Za-z0-9+/=\-_]+
 *
 * @param token - Continuation token to validate
 * @returns null if valid, error message string if invalid
 */
export function validateContinuationToken(token: string | undefined): string | null {
  if (token === undefined) {
    return null; // Optional parameter
  }

  if (typeof token !== 'string') {
    return 'Continuation token must be a string.';
  }

  if (token.length === 0 || token.length > 512) {
    return 'Continuation token length is invalid.';
  }

  // S3 tokens are base64-like (standard base64 + URL-safe variants + dots for S3-compatible systems like Ceph)
  if (!/^[A-Za-z0-9+/=\-_.]+$/.test(token)) {
    return 'Continuation token format is invalid.';
  }

  return null; // Valid
}

/**
 * Validates and decodes base64-encoded S3 prefix.
 *
 * Prefixes are used to filter S3 objects by key prefix.
 * They are base64-encoded in the URL to handle special characters.
 *
 * Validation rules:
 * - Optional parameter (returns empty string if not provided)
 * - Encoded form must be ≤ 2048 characters
 * - Must be valid base64
 * - Decoded form must be ≤ 1024 characters
 * - Must not contain path traversal sequences (..)
 * - Must not contain null bytes (\0)
 *
 * @param prefix - Base64-encoded prefix to validate and decode
 * @returns Object with decoded string and error message (null if valid)
 */
export function validateAndDecodePrefix(prefix: string | undefined): {
  decoded: string;
  error: string | null;
} {
  if (!prefix) {
    return { decoded: '', error: null };
  }

  if (typeof prefix !== 'string' || prefix.length > 2048) {
    return { decoded: '', error: 'Prefix parameter is invalid.' };
  }

  // Validate base64 format before attempting decode
  // Valid base64 characters: A-Z, a-z, 0-9, +, /, =
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(prefix)) {
    return { decoded: '', error: 'Prefix is not valid base64.' };
  }

  let decoded: string;
  try {
    decoded = atob(prefix);
  } catch (e) {
    return { decoded: '', error: 'Prefix is not valid base64.' };
  }

  if (decoded.length > 1024) {
    return { decoded: '', error: 'Decoded prefix is too long.' };
  }

  // Check for path traversal and null bytes
  if (decoded.includes('..') || decoded.includes('\0')) {
    return { decoded: '', error: 'Prefix contains invalid characters.' };
  }

  return { decoded, error: null };
}
