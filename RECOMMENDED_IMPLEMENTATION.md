# Recommended Secure Implementation

## Combining Security Hardening with Generator Pattern Optimization

**Original Document Date:** 2025-10-23
**Implementation Status Review:** 2025-10-24
**Status:** ❌ **NOT IMPLEMENTED**

---

## Implementation Status Summary

This document provided detailed recommendations for securing the pagination functionality identified in the original security assessment. **NONE of these recommendations were implemented** in the current codebase.

### Recommended vs. Actual State

| Recommendation             | Status             | Current Value          | Recommended Value        |
| -------------------------- | ------------------ | ---------------------- | ------------------------ |
| MAX_CONTAINS_SCAN_PAGES    | ❌ Not Implemented | **40**                 | **5**                    |
| MAX_OBJECTS_TO_EXAMINE     | ❌ Not Implemented | **None**               | **2,500**                |
| CONTAINS_SEARCH_TIMEOUT_MS | ❌ Not Implemented | **None**               | **10,000**               |
| Rate Limiting              | ❌ Not Implemented | **None**               | **5/min per IP**         |
| Generator Pattern          | ❌ Not Implemented | **Array accumulation** | **Generator/yield**      |
| Bucket Name Validation     | ❌ Not Implemented | **Weak regex**         | **Comprehensive checks** |
| Query Validation           | ❌ Not Implemented | **Too permissive**     | **Restrictive pattern**  |
| Token Validation           | ❌ Not Implemented | **Length only**        | **Format + length**      |
| Prefix Validation          | ❌ Not Implemented | **Silent failure**     | **Explicit checks**      |
| Security Headers           | ❌ Not Implemented | **None**               | **Helmet middleware**    |

### Additional Security Concerns (New Since Original Assessment)

Since the original recommendations, **new code was added that introduces additional security concerns:**

1. **Local Filesystem Access** (NEW) - Requires:

   - ✅ Authentication (not implemented)
   - ✅ Authorization per storage location (not implemented)
   - ✅ Audit logging for file operations (not implemented)
   - ✅ File type restrictions (not implemented)
   - ✅ Virus scanning (not implemented)

2. **Transfer Operations** (NEW) - Requires:
   - ✅ Authentication (not implemented)
   - ✅ Rate limiting (not implemented)
   - ✅ Size limits (not implemented)
   - ✅ Audit logging (not implemented)

### Positive Implementations (Not in Original Recommendations)

While the security recommendations were ignored, some positive security work was done:

| Implementation            | Status         | Quality                |
| ------------------------- | -------------- | ---------------------- |
| Path Traversal Protection | ✅ Implemented | ⭐⭐⭐⭐⭐ Excellent   |
| Security Test Coverage    | ✅ Implemented | ⭐⭐⭐⭐⭐ 1,824 lines |
| Custom Error Types        | ✅ Implemented | ⭐⭐⭐⭐ Good          |
| File Size Limits          | ✅ Implemented | ⭐⭐⭐ Basic           |

**However:** These positive implementations **do not address the critical security issues** identified in the original assessment, nor do they compensate for the **new critical vulnerability** (filesystem access without authentication).

---

## Original Document (2025-10-23)

This implementation combines:

- ✅ Security fixes (rate limiting, reduced limits, timeouts) - **NOT IMPLEMENTED**
- ✅ Memory efficiency (generator/iterator pattern) - **NOT IMPLEMENTED**
- ✅ Early termination optimizations - **NOT IMPLEMENTED**
- ✅ Progressive response capabilities - **NOT IMPLEMENTED**

**Note:** The recommendations below remain valid and should still be implemented.

---

## Complete Implementation

### File: `backend/src/routes/api/objects/index.ts`

```typescript
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getS3Config } from '../../../utils/config';
import { logAccess } from '../../../utils/logAccess';

// ============================================================================
// SECURITY CONFIGURATION - Reduced from original PR
// ============================================================================

const DEFAULT_MAX_KEYS = 500;
const MAX_ALLOWED_KEYS = 2000;

// 🔐 SECURITY: Reduced from 40 to 5 to prevent DoS
const MAX_CONTAINS_SCAN_PAGES = 5;

// 🔐 SECURITY: Maximum objects to examine (not just return)
const MAX_OBJECTS_TO_EXAMINE = 2500;

// 🔐 SECURITY: Request timeout for expensive searches
const CONTAINS_SEARCH_TIMEOUT_MS = 10000; // 10 seconds

// 🔐 SECURITY: Query parameter validation
const MAX_QUERY_LENGTH = 256;
const QUERY_PATTERN = /^[a-zA-Z0-9._\-\s]{1,256}$/; // More restrictive than PR

// 🔐 SECURITY: In-memory rate limiting (use Redis in production)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_CONTAINS_SEARCHES = 5;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface FilterMeta {
  q?: string;
  mode?: 'startsWith' | 'contains';
  partialResult?: boolean;
  scanPages?: number;
  objectsExamined?: number;
  scanStoppedReason?: 'maxKeysReached' | 'bucketExhausted' | 'scanCap' | 'examinedCap' | 'timeout';
  autoBroaden?: boolean;
  originalMode?: 'startsWith';
  matches?: {
    objects: Record<string, [number, number][]>;
    prefixes: Record<string, [number, number][]>;
  };
}

interface EnhancedResult {
  objects: any[] | undefined;
  prefixes: any[] | undefined;
  nextContinuationToken: string | null;
  isTruncated: boolean;
  filter?: FilterMeta;
}

interface ScanYieldItem {
  type: 'object' | 'prefix';
  data: any;
  matchRanges?: [number, number][];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const normalizeMaxKeys = (raw?: any): number => {
  const n = parseInt(raw, 10);
  if (isNaN(n)) return DEFAULT_MAX_KEYS;
  return Math.min(Math.max(1, n), MAX_ALLOWED_KEYS);
};

/**
 * Filter objects and prefixes by substring match
 */
const matchesQuery = (name: string, qLower: string): boolean => {
  return name.toLowerCase().includes(qLower);
};

/**
 * Compute match ranges for highlighting
 */
const computeMatchRanges = (leaf: string, qLower: string): [number, number][] => {
  const ranges: [number, number][] = [];
  if (!qLower) return ranges;

  const leafLower = leaf.toLowerCase();
  let idx = 0;
  while (idx <= leafLower.length) {
    const found = leafLower.indexOf(qLower, idx);
    if (found === -1) break;
    ranges.push([found, found + qLower.length]);
    idx = found + 1;
  }
  return ranges;
};

/**
 * Extract filename from S3 key or prefix
 */
const extractLeafName = (keyOrPrefix: string): string => {
  if (keyOrPrefix.endsWith('/')) {
    return keyOrPrefix.slice(0, -1).split('/').pop() || keyOrPrefix;
  }
  return keyOrPrefix.split('/').pop() || keyOrPrefix;
};

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check rate limit for contains searches
 * Returns true if limit exceeded
 */
const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX_CONTAINS_SEARCHES) {
    return true; // Rate limit exceeded
  }

  entry.count++;
  return false;
};

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/**
 * Validate bucket name according to AWS S3 naming rules
 */
const validateBucketName = (bucketName: string | undefined): string | null => {
  if (!bucketName || typeof bucketName !== 'string') {
    return 'Bucket name is required.';
  }

  // Length check: 3-63 characters
  if (bucketName.length < 3 || bucketName.length > 63) {
    return 'Bucket name must be between 3 and 63 characters.';
  }

  // Basic pattern: lowercase alphanumeric and hyphens
  if (!/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(bucketName)) {
    return 'Bucket name format is invalid.';
  }

  // AWS reserved patterns and invalid formats
  const invalidPatterns = [
    /^xn--/, // AWS reserved prefix
    /--/, // Consecutive hyphens
    /^\d+\.\d+\./, // IP address-like
  ];

  if (invalidPatterns.some((pattern) => pattern.test(bucketName))) {
    return 'Bucket name contains invalid patterns.';
  }

  return null; // Valid
};

/**
 * Validate continuation token format
 */
const validateContinuationToken = (token: string | undefined): string | null => {
  if (!token) return null; // Optional parameter

  if (typeof token !== 'string') {
    return 'Continuation token must be a string.';
  }

  if (token.length === 0 || token.length > 512) {
    return 'Continuation token length is invalid.';
  }

  // S3 tokens are base64-like
  if (!/^[A-Za-z0-9+/=\-_]+$/.test(token)) {
    return 'Continuation token format is invalid.';
  }

  return null; // Valid
};

/**
 * Validate query parameter
 */
const validateQuery = (q: string | undefined): string | null => {
  if (!q) return null; // Optional parameter

  if (typeof q !== 'string') {
    return 'Query must be a string.';
  }

  if (q.length === 0 || q.length > MAX_QUERY_LENGTH) {
    return `Query length must be between 1 and ${MAX_QUERY_LENGTH} characters.`;
  }

  if (!QUERY_PATTERN.test(q)) {
    return 'Query contains invalid characters.';
  }

  return null; // Valid
};

/**
 * Validate and decode base64 prefix
 */
const validateAndDecodePrefix = (
  prefix: string | undefined,
): { decoded: string; error: string | null } => {
  if (!prefix) {
    return { decoded: '', error: null };
  }

  if (typeof prefix !== 'string' || prefix.length > 2048) {
    return { decoded: '', error: 'Prefix parameter is invalid.' };
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
};

// ============================================================================
// GENERATOR PATTERN - MEMORY EFFICIENT SCANNING
// ============================================================================

/**
 * Generator function for contains-mode scanning
 * Yields objects/prefixes one at a time instead of accumulating in memory
 *
 * @yields {ScanYieldItem} Individual objects or prefixes that match the query
 */
async function* runContainsScanGenerator(
  s3Client: S3Client,
  bucketName: string,
  decoded_prefix: string | undefined,
  continuationToken: string | undefined,
  qLower: string,
  effectiveMaxKeys: number,
  abortSignal?: AbortSignal,
): AsyncGenerator<ScanYieldItem, FilterMeta, undefined> {
  let nextToken: string | undefined = continuationToken || undefined;
  let pagesScanned = 0;
  let totalObjectsExamined = 0;
  let yieldedCount = 0;
  let underlyingTruncated = false;
  let lastUnderlyingToken: string | undefined = undefined;
  let stoppedReason: FilterMeta['scanStoppedReason'] = 'bucketExhausted';

  try {
    while (pagesScanned < MAX_CONTAINS_SCAN_PAGES) {
      // Check for abort signal
      if (abortSignal?.aborted) {
        stoppedReason = 'timeout';
        break;
      }

      // Fetch one page from S3
      const page = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Delimiter: '/',
          Prefix: decoded_prefix || undefined,
          ContinuationToken: nextToken,
          MaxKeys: DEFAULT_MAX_KEYS,
        }),
      );

      pagesScanned += 1;
      const pageSize = (page.Contents?.length || 0) + (page.CommonPrefixes?.length || 0);
      totalObjectsExamined += pageSize;

      // Process objects with early termination
      if (page.Contents) {
        for (const obj of page.Contents) {
          const key = obj.Key || '';
          const leafName = extractLeafName(key);

          if (matchesQuery(leafName, qLower)) {
            yield {
              type: 'object',
              data: obj,
              matchRanges: computeMatchRanges(leafName, qLower),
            };
            yieldedCount++;

            // Early exit if we've yielded enough
            if (yieldedCount >= effectiveMaxKeys) {
              stoppedReason = 'maxKeysReached';
              lastUnderlyingToken = page.NextContinuationToken;
              underlyingTruncated = !!page.IsTruncated;
              return {
                q: qLower,
                mode: 'contains',
                partialResult: underlyingTruncated,
                scanPages: pagesScanned,
                objectsExamined: totalObjectsExamined,
                scanStoppedReason: stoppedReason,
              };
            }
          }
        }
      }

      // Process prefixes with early termination
      if (page.CommonPrefixes) {
        for (const prefix of page.CommonPrefixes) {
          const prefixName = prefix.Prefix || '';
          const leafName = extractLeafName(prefixName);

          if (matchesQuery(leafName, qLower)) {
            yield {
              type: 'prefix',
              data: prefix,
              matchRanges: computeMatchRanges(leafName, qLower),
            };
            yieldedCount++;

            // Early exit if we've yielded enough
            if (yieldedCount >= effectiveMaxKeys) {
              stoppedReason = 'maxKeysReached';
              lastUnderlyingToken = page.NextContinuationToken;
              underlyingTruncated = !!page.IsTruncated;
              return {
                q: qLower,
                mode: 'contains',
                partialResult: underlyingTruncated,
                scanPages: pagesScanned,
                objectsExamined: totalObjectsExamined,
                scanStoppedReason: stoppedReason,
              };
            }
          }
        }
      }

      underlyingTruncated = !!page.IsTruncated;
      lastUnderlyingToken = page.NextContinuationToken || undefined;

      // Check if we've examined too many objects (DoS protection)
      if (totalObjectsExamined >= MAX_OBJECTS_TO_EXAMINE) {
        stoppedReason = 'examinedCap';
        break;
      }

      // Check if bucket is exhausted
      if (!underlyingTruncated || !page.NextContinuationToken) {
        stoppedReason = 'bucketExhausted';
        break;
      }

      nextToken = page.NextContinuationToken;
    }

    // If we exited the loop without returning, we hit the page cap
    if (pagesScanned >= MAX_CONTAINS_SCAN_PAGES && underlyingTruncated) {
      stoppedReason = 'scanCap';
    }
  } finally {
    // Return metadata about the scan
    return {
      q: qLower,
      mode: 'contains',
      partialResult:
        underlyingTruncated &&
        (yieldedCount >= effectiveMaxKeys || stoppedReason !== 'bucketExhausted'),
      scanPages: pagesScanned,
      objectsExamined: totalObjectsExamined,
      scanStoppedReason: stoppedReason,
    };
  }
}

/**
 * Collect results from generator into arrays
 */
async function collectScanResults(
  generator: AsyncGenerator<ScanYieldItem, FilterMeta, undefined>,
  effectiveMaxKeys: number,
): Promise<{ objects: any[]; prefixes: any[]; meta: FilterMeta; matches: FilterMeta['matches'] }> {
  const objects: any[] = [];
  const prefixes: any[] = [];
  const objectMatches: Record<string, [number, number][]> = {};
  const prefixMatches: Record<string, [number, number][]> = {};

  let meta: FilterMeta = {
    q: '',
    mode: 'contains',
    partialResult: false,
    scanPages: 0,
    objectsExamined: 0,
  };

  try {
    for await (const item of generator) {
      if (item.type === 'object') {
        objects.push(item.data);
        if (item.matchRanges && item.data.Key) {
          objectMatches[item.data.Key] = item.matchRanges;
        }
      } else {
        prefixes.push(item.data);
        if (item.matchRanges && item.data.Prefix) {
          prefixMatches[item.data.Prefix] = item.matchRanges;
        }
      }

      if (objects.length + prefixes.length >= effectiveMaxKeys) {
        break;
      }
    }
  } catch (generatorReturn) {
    // Generator returned metadata via return statement
    if (typeof generatorReturn === 'object') {
      meta = generatorReturn as FilterMeta;
    }
  }

  return {
    objects,
    prefixes,
    meta,
    matches: { objects: objectMatches, prefixes: prefixMatches },
  };
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

const handleListRequest = async (
  req: FastifyRequest,
  reply: FastifyReply,
  bucketName: string,
  encodedPrefix: string | undefined,
): Promise<void> => {
  logAccess(req);
  const { s3Client } = getS3Config();
  const { continuationToken, q, mode, maxKeys } = (req.query || {}) as any;

  // ========================================
  // INPUT VALIDATION
  // ========================================

  // Validate bucket name
  const bucketError = validateBucketName(bucketName);
  if (bucketError) {
    reply.code(400).send({
      error: 'InvalidBucketName',
      message: bucketError,
    });
    return;
  }

  // Validate continuation token
  const tokenError = validateContinuationToken(continuationToken);
  if (tokenError) {
    reply.code(400).send({
      error: 'InvalidContinuationToken',
      message: tokenError,
    });
    return;
  }

  // Validate query parameter
  const queryError = validateQuery(q);
  if (queryError) {
    reply.code(400).send({
      error: 'InvalidQuery',
      message: queryError,
    });
    return;
  }

  // Validate and decode prefix
  const { decoded: decoded_prefix, error: prefixError } = validateAndDecodePrefix(encodedPrefix);
  if (prefixError) {
    reply.code(400).send({
      error: 'InvalidPrefix',
      message: prefixError,
    });
    return;
  }

  const effectiveMaxKeys = normalizeMaxKeys(maxKeys);
  const requestedMode: 'startsWith' | 'contains' | undefined = q
    ? mode === 'startsWith'
      ? 'startsWith'
      : 'contains'
    : undefined;

  // ========================================
  // SIMPLE LISTING (NO SEARCH)
  // ========================================

  if (!q) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: '/',
      Prefix: decoded_prefix || undefined,
      ContinuationToken: continuationToken || undefined,
      MaxKeys: effectiveMaxKeys,
    });

    try {
      const { Contents, CommonPrefixes, NextContinuationToken, IsTruncated } =
        await s3Client.send(command);

      reply.send({
        objects: Contents,
        prefixes: CommonPrefixes,
        nextContinuationToken: NextContinuationToken || null,
        isTruncated: !!IsTruncated,
      });
    } catch (err: any) {
      if (err instanceof S3ServiceException) {
        reply.code(err.$metadata.httpStatusCode || 500).send({
          error: err.name || 'S3ServiceException',
          message: err.message || 'An S3 service exception occurred.',
        });
      } else {
        reply.code(500).send({
          error: 'InternalError',
          message: 'An unexpected error occurred.',
        });
      }
    }
    return;
  }

  // ========================================
  // SEARCH MODE - RATE LIMITING
  // ========================================

  const qLower = (q as string).toLowerCase();

  // Rate limiting for contains searches
  if (requestedMode === 'contains') {
    const clientIp = req.ip;
    if (checkRateLimit(clientIp)) {
      reply.code(429).send({
        error: 'RateLimitExceeded',
        message: `Too many contains searches. Maximum ${RATE_LIMIT_MAX_CONTAINS_SEARCHES} per minute.`,
        retryAfter: 60,
      });
      return;
    }
  }

  // ========================================
  // CONTAINS MODE WITH GENERATOR PATTERN
  // ========================================

  if (requestedMode === 'contains') {
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, CONTAINS_SEARCH_TIMEOUT_MS);

    try {
      // Use generator pattern for memory efficiency
      const generator = runContainsScanGenerator(
        s3Client,
        bucketName,
        decoded_prefix,
        continuationToken,
        qLower,
        effectiveMaxKeys,
        abortController.signal,
      );

      const { objects, prefixes, meta, matches } = await collectScanResults(
        generator,
        effectiveMaxKeys,
      );

      clearTimeout(timeoutId);

      // Determine response token
      const morePossible = meta.partialResult || false;
      const responseToken = morePossible ? continuationToken || 'has-more' : null;

      reply.send({
        objects,
        prefixes,
        nextContinuationToken: responseToken,
        isTruncated: morePossible,
        filter: {
          ...meta,
          matches,
        },
      });
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError' || abortController.signal.aborted) {
        reply.code(408).send({
          error: 'SearchTimeout',
          message: 'Search operation timed out. Please try a more specific query.',
        });
        return;
      }

      if (err instanceof S3ServiceException) {
        reply.code(err.$metadata.httpStatusCode || 500).send({
          error: err.name || 'S3ServiceException',
          message: err.message || 'An S3 service exception occurred.',
        });
      } else {
        req.log.error({ err }, 'Unexpected error in contains search');
        reply.code(500).send({
          error: 'InternalError',
          message: 'An unexpected error occurred.',
        });
      }
    }
    return;
  }

  // ========================================
  // STARTS-WITH MODE (PREFIX-BASED)
  // ========================================

  // StartsWith is efficient because S3 supports prefix filtering natively
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: '/',
      Prefix: decoded_prefix || undefined,
      ContinuationToken: continuationToken || undefined,
      MaxKeys: effectiveMaxKeys,
    });

    const { Contents, CommonPrefixes, NextContinuationToken, IsTruncated } =
      await s3Client.send(command);

    // Apply client-side filtering for starts-with on leaf name only
    const filteredObjects = Contents?.filter((obj) => {
      const leafName = extractLeafName(obj.Key || '');
      return matchesQuery(leafName, qLower);
    });

    const filteredPrefixes = CommonPrefixes?.filter((prefix) => {
      const leafName = extractLeafName(prefix.Prefix || '');
      return matchesQuery(leafName, qLower);
    });

    // Compute match ranges for highlighting
    const objectMatches: Record<string, [number, number][]> = {};
    const prefixMatches: Record<string, [number, number][]> = {};

    filteredObjects?.forEach((obj) => {
      const leafName = extractLeafName(obj.Key || '');
      objectMatches[obj.Key || ''] = computeMatchRanges(leafName, qLower);
    });

    filteredPrefixes?.forEach((prefix) => {
      const leafName = extractLeafName(prefix.Prefix || '');
      prefixMatches[prefix.Prefix || ''] = computeMatchRanges(leafName, qLower);
    });

    reply.send({
      objects: filteredObjects,
      prefixes: filteredPrefixes,
      nextContinuationToken: NextContinuationToken || null,
      isTruncated: !!IsTruncated,
      filter: {
        q,
        mode: 'startsWith',
        partialResult: false,
        matches: {
          objects: objectMatches,
          prefixes: prefixMatches,
        },
      },
    });
  } catch (err: any) {
    if (err instanceof S3ServiceException) {
      reply.code(err.$metadata.httpStatusCode || 500).send({
        error: err.name || 'S3ServiceException',
        message: err.message || 'An S3 service exception occurred.',
      });
    } else {
      reply.code(500).send({
        error: 'InternalError',
        message: 'An unexpected error occurred.',
      });
    }
  }
};

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

export default async (fastify: FastifyInstance): Promise<void> => {
  // List objects in bucket root
  fastify.get('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
    const { bucketName } = req.params as any;
    await handleListRequest(req, reply, bucketName, undefined);
  });

  // List objects under a prefix
  fastify.get('/:bucketName/:prefix', async (req: FastifyRequest, reply: FastifyReply) => {
    const { bucketName, prefix } = req.params as any;
    await handleListRequest(req, reply, bucketName, prefix);
  });

  // ... rest of routes (view, download, delete, upload, etc.)
};
```

---

## Key Improvements Summary

### 🔐 Security Enhancements

| Feature                  | Original PR | This Implementation | Improvement         |
| ------------------------ | ----------- | ------------------- | ------------------- |
| **Max Scan Pages**       | 40          | 5                   | 87.5% reduction     |
| **Objects Examined Cap** | None        | 2,500               | DoS protection      |
| **Request Timeout**      | None        | 10 seconds          | Prevents hanging    |
| **Rate Limiting**        | None        | 5/min per IP        | Prevents abuse      |
| **Bucket Validation**    | Weak regex  | Comprehensive       | Path traversal safe |
| **Query Validation**     | Permissive  | Restrictive         | Injection safe      |
| **Token Validation**     | Length only | Format + length     | Forgery resistant   |
| **Prefix Validation**    | Silent fail | Explicit checks     | Path traversal safe |

### ⚡ Performance Optimizations

| Feature               | Original PR    | This Implementation | Benefit         |
| --------------------- | -------------- | ------------------- | --------------- |
| **Memory Usage**      | 20,000 objects | ~500 objects        | 97.5% reduction |
| **Early Termination** | No             | Yes                 | CPU savings     |
| **Progressive Yield** | No             | Yes                 | Better UX       |
| **GC Pressure**       | High           | Low                 | Stability       |

### 🎯 Generator Pattern Benefits

1. **Memory Efficiency**

   - Original: Accumulates all results before returning
   - Generator: Yields one at a time
   - Peak memory: 500 objects instead of 20,000

2. **Early Exit**

   - Stops processing immediately when `effectiveMaxKeys` reached
   - No wasted filtering after quota filled

3. **Streaming Ready**

   - Can be adapted for SSE or chunked responses
   - Progressive rendering on frontend

4. **Timeout Friendly**
   - Abort signal checked on each iteration
   - Clean cancellation mid-stream

---

## Usage Examples

### Basic Search

```bash
# Simple contains search (rate limited)
curl "http://api/my-bucket?q=vacation&mode=contains"

# Response:
{
  "objects": [...],
  "prefixes": [...],
  "filter": {
    "q": "vacation",
    "mode": "contains",
    "scanPages": 3,
    "objectsExamined": 1500,
    "scanStoppedReason": "maxKeysReached",
    "matches": {
      "objects": {
        "photos/vacation-2024.jpg": [[7, 15]]
      }
    }
  }
}
```

### Rate Limit Hit

```bash
# 6th request within 1 minute
curl "http://api/my-bucket?q=test&mode=contains"

# Response: HTTP 429
{
  "error": "RateLimitExceeded",
  "message": "Too many contains searches. Maximum 5 per minute.",
  "retryAfter": 60
}
```

### Validation Errors

```bash
# Invalid bucket name
curl "http://api/../../etc/passwd"

# Response: HTTP 400
{
  "error": "InvalidBucketName",
  "message": "Bucket name format is invalid."
}

# Invalid query
curl "http://api/bucket?q=<script>alert(1)</script>"

# Response: HTTP 400
{
  "error": "InvalidQuery",
  "message": "Query contains invalid characters."
}
```

---

## Migration Guide

### Step 1: Update Security Constants

```typescript
// Change these values from PR's original:
const MAX_CONTAINS_SCAN_PAGES = 5; // Was: 40
const MAX_OBJECTS_TO_EXAMINE = 2500; // New
const CONTAINS_SEARCH_TIMEOUT_MS = 10000; // New
```

### Step 2: Replace runContainsScan with Generator

```typescript
// Old approach (PR's original):
const scan = await runContainsScan(...);
return scan.aggregatedObjects;

// New approach (generator):
const generator = runContainsScanGenerator(...);
const { objects, prefixes, meta } = await collectScanResults(generator, maxKeys);
return objects;
```

### Step 3: Add Rate Limiting

```typescript
// Before search, check rate limit:
if (checkRateLimit(req.ip)) {
  return reply.code(429).send({ error: 'RateLimitExceeded' });
}
```

### Step 4: Upgrade to Production Rate Limiter (Later)

```typescript
// Replace in-memory Map with Redis:
import Redis from 'ioredis';
const redis = new Redis();

const checkRateLimit = async (ip: string): Promise<boolean> => {
  const key = `ratelimit:contains:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }
  return count > RATE_LIMIT_MAX_CONTAINS_SEARCHES;
};
```

---

## Testing

### Unit Tests

```typescript
describe('Input Validation', () => {
  it('should reject invalid bucket names', () => {
    expect(validateBucketName('AB')).toBe('Bucket name must be between 3 and 63 characters.');
    expect(validateBucketName('bucket--name')).toBe('Bucket name contains invalid patterns.');
    expect(validateBucketName('xn--bucket')).toBe('Bucket name contains invalid patterns.');
  });

  it('should reject invalid queries', () => {
    expect(validateQuery('<script>')).toBe('Query contains invalid characters.');
    expect(validateQuery('a'.repeat(257))).toContain('Query length must be');
  });
});

describe('Generator Pattern', () => {
  it('should yield objects one at a time', async () => {
    const generator = runContainsScanGenerator(...);
    const first = await generator.next();
    expect(first.value.type).toBe('object');
  });

  it('should terminate early at effectiveMaxKeys', async () => {
    const generator = runContainsScanGenerator(..., 5);
    const items = [];
    for await (const item of generator) {
      items.push(item);
    }
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it('should respect timeout signal', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const generator = runContainsScanGenerator(..., controller.signal);
    await expect(collectScanResults(generator)).rejects.toThrow();
  });
});

describe('Rate Limiting', () => {
  it('should allow 5 requests within window', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('127.0.0.1')).toBe(false);
    }
  });

  it('should block 6th request', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('127.0.0.1');
    }
    expect(checkRateLimit('127.0.0.1')).toBe(true);
  });
});
```

---

## Monitoring & Observability

### Metrics to Track

```typescript
// Add instrumentation:
fastify.addHook('onResponse', async (request, reply) => {
  const { q, mode } = request.query as any;

  if (q && mode === 'contains') {
    // Log expensive search metrics
    metrics.increment('search.contains.count');
    metrics.histogram('search.contains.duration', reply.getResponseTime());

    if (reply.statusCode === 429) {
      metrics.increment('search.ratelimit.exceeded');
    }

    if (reply.statusCode === 408) {
      metrics.increment('search.timeout');
    }
  }
});
```

### Alerts to Configure

1. **High rate limit hits**: Alert if >100 rate limit errors/minute
2. **Frequent timeouts**: Alert if >10% of searches timeout
3. **S3 API spike**: Alert if LIST calls >1000/minute
4. **Memory pressure**: Alert if heap usage >80%

---

## Production Deployment Checklist

- [ ] Replace in-memory rate limiter with Redis
- [ ] Configure monitoring dashboards
- [ ] Set up alerts for anomalies
- [ ] Load test with realistic traffic
- [ ] Document API changes for users
- [ ] Add feature flag to disable contains search if needed
- [ ] Review AWS S3 request quotas
- [ ] Enable request logging for security audits
- [ ] Test timeout handling under load
- [ ] Verify memory usage under stress

---

## Conclusion

This implementation provides:

- ✅ **87.5% reduction in DoS impact** (5 pages vs 40)
- ✅ **97.5% reduction in memory usage** (generator pattern)
- ✅ **Rate limiting** to prevent abuse
- ✅ **Comprehensive input validation**
- ✅ **Timeout protection** against hanging requests
- ✅ **Production-ready patterns** (generators, abort signals)
- ✅ **Backward compatible** API surface

**This is ready for production deployment** with proper monitoring in place.

---

## Additional Recommendations for PVC Support (NEW - 2025-10-24)

### Critical: Authentication and Authorization

The PVC support code adds local filesystem access without authentication. This must be addressed immediately:

```typescript
// File: backend/src/plugins/auth.ts (NEW FILE NEEDED)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

interface User {
  id: string;
  username: string;
  roles: string[];
  allowedLocations: string[];
}

// JWT authentication middleware
export const authenticateUser = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<User> => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized', message: 'No authentication token provided' });
    throw new Error('Unauthorized');
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as User;
    return decoded;
  } catch (error) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid authentication token' });
    throw new Error('Unauthorized');
  }
};

// Authorization middleware for storage locations
export const authorizeLocation = (user: User, locationId: string): boolean => {
  // Check if user has access to this specific location
  if (!user.allowedLocations.includes(locationId) && !user.roles.includes('admin')) {
    return false;
  }
  return true;
};

// Audit logging
export const auditLog = async (
  user: User,
  action: string,
  resource: string,
  status: number,
  details?: any,
) => {
  // Log to audit trail (database, file, or centralized logging service)
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      userId: user.id,
      username: user.username,
      action,
      resource,
      status,
      details,
    }),
  );
};
```

### Secure Local Storage Routes

```typescript
// File: backend/src/routes/api/local/index.ts

import { authenticateUser, authorizeLocation, auditLog } from '../../plugins/auth';

export default async (fastify: FastifyInstance): Promise<void> => {
  // Authentication hook for ALL routes
  fastify.addHook('onRequest', async (request, reply) => {
    const user = await authenticateUser(request, reply);
    request.user = user;
  });

  // Authorization hook for routes with locationId parameter
  fastify.addHook('preHandler', async (request, reply) => {
    const { locationId } = request.params as any;

    if (locationId && !authorizeLocation(request.user, locationId)) {
      await auditLog(request.user, request.method, request.url, 403, {
        reason: 'insufficient_permissions',
        locationId,
      });
      reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this storage location',
      });
    }
  });

  // Audit logging hook for all responses
  fastify.addHook('onResponse', async (request, reply) => {
    await auditLog(request.user, request.method, request.url, reply.statusCode, {
      params: request.params,
      query: request.query,
    });
  });

  // Routes remain unchanged, but now protected by hooks above
  fastify.get('/locations', async (req) => {
    // Filter locations based on user's allowedLocations
    const allLocations = await getStorageLocations(req.log);
    const userLocations = allLocations.filter(
      (loc) => req.user.allowedLocations.includes(loc.id) || req.user.roles.includes('admin'),
    );
    return { locations: userLocations };
  });

  // ... rest of routes
};
```

### File Type Restrictions

```typescript
// File: backend/src/utils/fileValidation.ts (NEW FILE NEEDED)

const ALLOWED_EXTENSIONS = [
  // Model files
  '.safetensors',
  '.bin',
  '.pt',
  '.pth',
  '.onnx',
  '.gguf',
  // Data files
  '.csv',
  '.json',
  '.jsonl',
  '.parquet',
  '.arrow',
  // Text files
  '.txt',
  '.md',
  '.yaml',
  '.yml',
  // Archives
  '.tar',
  '.gz',
  '.zip',
];

const BLOCKED_EXTENSIONS = [
  // Executables
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.sh',
  '.bat',
  '.cmd',
  // Scripts
  '.js',
  '.ts',
  '.py',
  '.rb',
  '.pl',
  // System files
  '.sys',
  '.drv',
];

export const validateFileType = (filename: string): { allowed: boolean; reason?: string } => {
  const ext = path.extname(filename).toLowerCase();

  // Check blocked list first
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { allowed: false, reason: `File type ${ext} is blocked for security reasons` };
  }

  // Check allowed list
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { allowed: false, reason: `File type ${ext} is not in the allowed list` };
  }

  return { allowed: true };
};
```

### Rate Limiting for Expensive Operations

```typescript
// File: backend/src/routes/api/transfer/index.ts

import rateLimit from '@fastify/rate-limit';

export default async (fastify: FastifyInstance): Promise<void> => {
  // Rate limit transfer operations
  await fastify.register(rateLimit, {
    max: 10, // 10 transfers per window
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'RateLimitExceeded',
      message: 'Too many transfer requests. Maximum 10 per minute.',
      retryAfter: 60,
    }),
  });

  // ... rest of implementation
};
```

### Quota Management

```typescript
// File: backend/src/utils/quotaManager.ts (NEW FILE NEEDED)

interface Quota {
  maxStorageBytes: number;
  maxFileCount: number;
  currentStorageBytes: number;
  currentFileCount: number;
}

export const checkQuota = async (
  locationId: string,
  additionalBytes: number,
  additionalFiles: number,
): Promise<{ allowed: boolean; reason?: string }> => {
  const quota = await getLocationQuota(locationId);

  if (quota.currentStorageBytes + additionalBytes > quota.maxStorageBytes) {
    return {
      allowed: false,
      reason: `Storage quota exceeded. ${formatBytes(quota.maxStorageBytes - quota.currentStorageBytes)} remaining.`,
    };
  }

  if (quota.currentFileCount + additionalFiles > quota.maxFileCount) {
    return {
      allowed: false,
      reason: `File count quota exceeded. ${quota.maxFileCount - quota.currentFileCount} files remaining.`,
    };
  }

  return { allowed: true };
};
```

### Updated Production Deployment Checklist

**Must Complete Before Production:**

- [ ] ✅ Implement authentication (JWT or similar)
- [ ] ✅ Implement authorization per storage location
- [ ] ✅ Add comprehensive audit logging
- [ ] ✅ Add file type restrictions
- [ ] ✅ Add rate limiting for transfers
- [ ] ✅ Add quota management per location
- [ ] ✅ Fix DoS vulnerability (MAX_CONTAINS_SCAN_PAGES = 5)
- [ ] ✅ Fix CORS configuration
- [ ] ✅ Add security headers (Helmet)
- [ ] ✅ Strengthen input validation (bucket names, query params, tokens)

**Strongly Recommended:**

- [ ] Add virus scanning for uploads (ClamAV integration)
- [ ] Add content type verification (magic number checking)
- [ ] Implement IP-based rate limiting
- [ ] Add monitoring and alerting
- [ ] Set up centralized logging (ELK, Splunk, etc.)
- [ ] Create incident response plan
- [ ] Perform security testing and penetration testing
- [ ] Set up automated security scanning in CI/CD

**Organizational:**

- [ ] Mandatory security review for all PRs
- [ ] Security training for development team
- [ ] Architecture review process for major features
- [ ] Security gates in CI/CD pipeline

---

**Document Status:**

- **Original:** 2025-10-23 - Pagination security recommendations
- **Updated:** 2025-10-24 - Added PVC support security requirements
- **Implementation Status:** ❌ None of the recommendations have been implemented
- **Next Update:** After security implementations are complete
