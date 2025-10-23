# Security Assessment Report
## PR: fix-pagination Branch

**Date:** 2025-10-23
**Commits Analyzed:**
- `55696a4` - "support pagination to list more than 1000 objects"
- `0a89b7a` - "fix: server side filtering with auto pagination"

**Author:** Veera Varala <vvarala@rosen-group.com>

---

## Executive Summary

This security assessment identifies **CRITICAL** and **HIGH** severity vulnerabilities in the submitted code that must be addressed before merging. While the PR includes some positive security improvements (EventSource cleanup, abort controller fixes), it introduces significant security risks through incomplete input validation, missing authorization checks, and potential Denial of Service (DoS) vectors.

**Recommendation:** ❌ **DO NOT MERGE** until critical and high-severity issues are resolved.

---

## Critical Findings

### 🔴 CRITICAL-1: Missing Authentication & Authorization

**Location:** `backend/src/routes/api/objects/index.ts` (all endpoints)

**Issue:** All API endpoints lack authentication and authorization checks. Any user can:
- List objects in any bucket
- Delete objects from any bucket
- Upload/download objects
- Enumerate buckets and their contents

**Evidence:**
```typescript
// Lines 396-399 - No auth middleware
fastify.get('/:bucketName', async (req: FastifyRequest, reply: FastifyReply) => {
  const { bucketName } = req.params as any;
  await handleListRequest(req, reply, bucketName, undefined);
});
```

**Impact:**
- Unauthorized data access
- Data exfiltration
- Unauthorized data modification/deletion
- Complete bypass of access controls

**Remediation:**
```typescript
// Add authentication middleware
fastify.addHook('onRequest', async (request, reply) => {
  // Verify JWT/session token
  // Check user has permission for bucket operations
});
```

---

### 🔴 CRITICAL-2: Unbounded Resource Consumption (DoS)

**Location:** `backend/src/routes/api/objects/index.ts:171-230`

**Issue:** The `runContainsScan` function can be weaponized for Denial of Service attacks through:

1. **No Rate Limiting:** Attackers can make unlimited expensive scan requests
2. **Memory Exhaustion:** Aggregating objects without size limits
3. **S3 API Amplification:** Each user request triggers up to 40 S3 API calls

**Vulnerable Code:**
```typescript
// Lines 186-203 - Can scan 40 pages × 500 objects = 20,000 objects in memory
while (pagesScanned < MAX_CONTAINS_SCAN_PAGES) {
  const page = await s3Client.send(new ListObjectsV2Command({
    Bucket: bucketName,
    Delimiter: '/',
    Prefix: decoded_prefix || undefined,
    ContinuationToken: nextToken,
    MaxKeys: DEFAULT_MAX_KEYS,  // 500 per page
  }));
  pagesScanned += 1;
  const { filteredObjects, filteredPrefixes } = applyContainsFilter(page.Contents, page.CommonPrefixes, qLower);
  if (filteredObjects) aggregatedObjects.push(...filteredObjects);  // Unbounded growth
  if (filteredPrefixes) aggregatedPrefixes.push(...filteredPrefixes);
  // ... no memory size check
}
```

**Attack Scenario:**
```bash
# Attacker sends concurrent requests with wildcards
for i in {1..100}; do
  curl "http://api/bucket?q=a&mode=contains" &
done
# Result: 100 × 40 × 500 = 2,000,000 objects loaded into memory
# Cost: 4,000 S3 API calls in parallel
```

**Impact:**
- Server memory exhaustion
- S3 API quota exhaustion
- Increased AWS costs
- Service unavailability

**Remediation:**
1. Add rate limiting per IP/user
2. Add total memory size checks (not just count)
3. Reduce MAX_CONTAINS_SCAN_PAGES from 40 to 5-10
4. Implement request queuing/throttling
5. Add timeout protection

---

### 🔴 CRITICAL-3: CORS Misconfiguration

**Location:** `backend/src/server.ts:37-42`

**Issue:** Permissive CORS policy allows any origin to make requests:

```typescript
app.register(cors, {
  origin: ['*'],  // ⚠️ Allows ANY website to call API
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
});
```

**Impact:**
Combined with missing authentication (CRITICAL-1), this allows:
- Cross-Site Request Forgery (CSRF) attacks
- Data theft from any website
- Unauthorized actions on behalf of users

**Remediation:**
```typescript
app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'DELETE'],
});
```

---

## High Severity Findings

### 🟠 HIGH-1: Weak Input Validation - Bucket Name

**Location:** `backend/src/routes/api/objects/index.ts:242`

**Issue:** Bucket name validation is incomplete and allows potential bypass:

```typescript
if (bucketName && !/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/.test(bucketName)) {
```

**Problems:**
1. **Off-by-one error:** Regex allows 3-63 chars but should be 3-63 total
2. **Missing DNS compliance:** Doesn't block consecutive hyphens `--`
3. **Allows AWS reserved patterns:** `xn--`, IP addresses, etc.
4. **No check for undefined:** `bucketName &&` allows undefined to pass

**Bypass Example:**
```bash
curl "/undefined"  # bucketName is undefined, validation skipped
curl "/ab"  # 2 chars, should fail but might pass depending on JS engine
```

**Remediation:**
```typescript
if (!bucketName || typeof bucketName !== 'string') {
  return reply.code(400).send({
    error: 'InvalidBucketName',
    message: 'Bucket name is required.'
  });
}

// AWS S3 bucket naming rules (RFC 1123 compliant)
const validBucketName = /^[a-z0-9]([a-z0-9\-]{1,61}[a-z0-9])?$/;
const invalidPatterns = [
  /^xn--/,           // AWS reserved
  /^\d+\.\d+\./,     // IP-like
  /--/,              // consecutive hyphens
  /-$/,              // ends with hyphen
  /^-/               // starts with hyphen
];

if (!validBucketName.test(bucketName) ||
    invalidPatterns.some(p => p.test(bucketName))) {
  return reply.code(400).send({
    error: 'InvalidBucketName',
    message: 'Bucket name violates AWS S3 naming rules.'
  });
}
```

---

### 🟠 HIGH-2: Query Parameter Injection Risk

**Location:** `backend/src/routes/api/objects/index.ts:64`

**Issue:** While there's pattern validation, it's too permissive:

```typescript
const QUERY_PATTERN = /^[\w.\- @()+=/:]*$/;
```

**Problems:**
1. Allows `()` which could be used for function injection in some contexts
2. Allows `+` which has special meaning in URLs
3. Allows `:` and `/` which could bypass filters
4. No protection against ReDoS (Regular Expression Denial of Service)

**Attack Examples:**
```bash
# Bypass filters using URL encoding edge cases
?q=%2B%2B%2B%2B%2B  # Many + signs
?q=/../../../secret  # Path traversal attempt (though S3 may handle)
?q=(((((((((((((  # Could cause regex backtracking
```

**Remediation:**
```typescript
// More restrictive pattern
const QUERY_PATTERN = /^[a-zA-Z0-9._\-\s]{1,256}$/;

// Add ReDoS protection with timeout
const isValidQuery = (q: string): boolean => {
  if (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH) return false;

  try {
    // Test with timeout protection
    const timeoutId = setTimeout(() => { throw new Error('Timeout'); }, 100);
    const result = QUERY_PATTERN.test(q);
    clearTimeout(timeoutId);
    return result;
  } catch {
    return false;
  }
};
```

---

### 🟠 HIGH-3: Continuation Token Validation Insufficient

**Location:** `backend/src/routes/api/objects/index.ts:250`

**Issue:** Continuation token validation only checks type and length:

```typescript
if (continuationToken && (typeof continuationToken !== 'string' || continuationToken.length > 1024)) {
```

**Problems:**
1. Accepts ANY string up to 1024 chars
2. No format validation (S3 tokens are base64-like)
3. Could allow injection of malicious tokens
4. No expiration/signature verification

**Impact:**
- Token forgery
- Unauthorized pagination state manipulation
- Potential S3 SDK exploitation

**Remediation:**
```typescript
if (continuationToken) {
  if (typeof continuationToken !== 'string' ||
      continuationToken.length === 0 ||
      continuationToken.length > 512) {
    return reply.code(400).send({
      error: 'InvalidContinuationToken',
      message: 'Continuation token length invalid.'
    });
  }

  // S3 continuation tokens are base64-like with specific charset
  if (!/^[A-Za-z0-9+/=\-_]+$/.test(continuationToken)) {
    return reply.code(400).send({
      error: 'InvalidContinuationToken',
      message: 'Continuation token format invalid.'
    });
  }
}
```

---

### 🟠 HIGH-4: Base64 Prefix Decoding Without Validation

**Location:** `backend/src/routes/api/objects/index.ts:404-405`

**Issue:** Base64 decoding happens without validation:

```typescript
if (prefix !== undefined) {
  try { decoded_prefix = atob(prefix); } catch { decoded_prefix = ''; }
}
```

**Problems:**
1. Silent failure on decode errors
2. No validation of decoded content
3. Could allow path traversal: `../../../etc/passwd` encoded
4. No length limit on decoded result

**Remediation:**
```typescript
if (prefix !== undefined) {
  if (typeof prefix !== 'string' || prefix.length > 2048) {
    return reply.code(400).send({
      error: 'InvalidPrefix',
      message: 'Prefix parameter invalid.'
    });
  }

  try {
    decoded_prefix = atob(prefix);

    // Validate decoded prefix
    if (decoded_prefix.length > 1024) {
      return reply.code(400).send({
        error: 'InvalidPrefix',
        message: 'Decoded prefix too long.'
      });
    }

    // Block path traversal
    if (decoded_prefix.includes('..') || decoded_prefix.includes('\0')) {
      return reply.code(400).send({
        error: 'InvalidPrefix',
        message: 'Prefix contains invalid characters.'
      });
    }
  } catch (e) {
    return reply.code(400).send({
      error: 'InvalidPrefix',
      message: 'Prefix is not valid base64.'
    });
  }
}
```

---

## Medium Severity Findings

### 🟡 MEDIUM-1: Information Disclosure via Error Messages

**Location:** Multiple locations in `backend/src/routes/api/objects/index.ts`

**Issue:** Error messages leak internal details:

```typescript
reply.code(400).send({
  error: 'InvalidQuery',
  message: `Query parameter 'q' is invalid. Max length ${MAX_QUERY_LENGTH}, allowed pattern ${QUERY_PATTERN.toString()}.`,
});
```

**Impact:**
- Reveals validation logic to attackers
- Helps attackers craft bypass attempts
- Exposes internal constants

**Remediation:**
```typescript
// Generic error for external users
reply.code(400).send({
  error: 'InvalidQuery',
  message: 'Query parameter format is invalid.'
});

// Log detailed info internally
req.log.warn({ q, reason: 'pattern_mismatch', pattern: QUERY_PATTERN }, 'Invalid query');
```

---

### 🟡 MEDIUM-2: No Request Size Limits

**Location:** `backend/src/routes/api/objects/index.ts`

**Issue:** Missing limits on:
- Total URL length
- Number of query parameters
- Request body size for uploads

**Current Config:**
```typescript
// server.ts:34
maxParamLength: 1000,  // Only limits individual param
```

**Remediation:**
```typescript
// In server.ts
const app = fastify({
  logger: pino({...}),
  maxParamLength: 200,
  bodyLimit: 100 * 1024 * 1024, // 100MB max upload
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  connectionTimeout: 30000,
  keepAliveTimeout: 5000,
});
```

---

### 🟡 MEDIUM-3: Race Condition in Abort Controller (Frontend)

**Location:** `frontend/src/app/components/ObjectBrowser/objectBrowserFunctions.ts:72-77`

**Issue:** Global state management has race condition:

```typescript
if (!abortController && currentObjectsFetchAbort) {
  currentObjectsFetchAbort.abort();
}
if (!abortController) {
  currentObjectsFetchAbort = controller;
}
```

**Impact:**
- Inconsistent request cancellation
- Potential memory leaks if race occurs
- User sees stale data

**Recommendation:**
Remove global `currentObjectsFetchAbort` entirely and always use component-scoped controllers.

---

### 🟡 MEDIUM-4: Missing Security Headers

**Location:** `backend/src/server.ts`

**Issue:** No security headers configured:
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Strict-Transport-Security`
- No `Content-Security-Policy`

**Remediation:**
```typescript
import helmet from '@fastify/helmet';

app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});
```

---

## Low Severity / Best Practices

### 🔵 LOW-1: Insufficient Logging

**Issue:** Security-relevant events aren't logged:
- Failed validation attempts
- Unusual pagination patterns
- Rate limit hits (not implemented)

**Recommendation:**
Add structured logging for security monitoring.

---

### 🔵 LOW-2: Missing Input Sanitization

**Issue:** While validation exists, no sanitization occurs before logging:
```typescript
req.log.warn({ q, bucketName }, 'Invalid request');  // Could log injection
```

**Recommendation:**
Sanitize inputs before logging to prevent log injection.

---

### 🔵 LOW-3: No Test Coverage for Security Validations

**Issue:** Grep results show zero tests for:
- Bucket name validation
- Query parameter validation
- Continuation token validation

**Evidence:**
```bash
$ grep -r "InvalidBucketName\|InvalidQuery\|InvalidContinuationToken" backend/src/__tests__/
# No matches found
```

**Recommendation:**
Add comprehensive security test suite:

```typescript
describe('Input Validation Security', () => {
  describe('Bucket Name Validation', () => {
    it('should reject undefined bucket name', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/undefined',
      });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.payload).error).toBe('InvalidBucketName');
    });

    it('should reject bucket names with path traversal', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/../../../etc',
      });
      expect(response.statusCode).toBe(400);
    });

    // Add 15+ more test cases
  });

  describe('Query Injection Prevention', () => {
    it('should reject query with special characters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/bucket?q=<script>alert(1)</script>',
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
```

---

## Positive Security Improvements ✅

### ✅ POSITIVE-1: EventSource Memory Leak Fix

**Location:** `frontend/src/app/components/ObjectBrowser/ObjectBrowser.tsx:68-89`

The PR properly implements EventSource cleanup:
```typescript
React.useEffect(() => {
  return () => {
    if (singleFileEventSource.current) {
      singleFileEventSource.current.close();
      singleFileEventSource.current = null;
    }
    // ... additional cleanup
  };
}, []);
```

**Impact:** Prevents memory leaks and resource exhaustion.

---

### ✅ POSITIVE-2: Abort Controller Improvements

Component-scoped abort controllers prevent race conditions in most cases.

---

### ✅ POSITIVE-3: Some Input Validation Added

While incomplete, the addition of validation is a step in the right direction.

---

## Summary of Findings

| Severity | Count | Must Fix Before Merge |
|----------|-------|----------------------|
| CRITICAL | 3 | ✅ YES |
| HIGH | 4 | ✅ YES |
| MEDIUM | 4 | ⚠️ Recommended |
| LOW | 3 | ℹ️ Optional |
| POSITIVE | 3 | N/A |

---

## Remediation Priority

### Before Merge (Required)
1. **CRITICAL-1:** Add authentication/authorization to all endpoints
2. **CRITICAL-2:** Implement rate limiting and DoS protection
3. **CRITICAL-3:** Fix CORS configuration
4. **HIGH-1:** Strengthen bucket name validation
5. **HIGH-2:** Improve query parameter validation
6. **HIGH-3:** Add continuation token format validation
7. **HIGH-4:** Validate base64 decoded prefixes

### Post-Merge (Recommended)
8. **MEDIUM-1 to MEDIUM-4:** Address information disclosure, security headers
9. **LOW-1 to LOW-3:** Enhance logging and test coverage

---

## Recommended Actions

### Immediate (Block Merge)
- [ ] Reject PR in current state
- [ ] Request author implement authentication/authorization
- [ ] Request author add rate limiting
- [ ] Request author fix CORS policy
- [ ] Request comprehensive security tests

### Follow-up
- [ ] Security team review after fixes
- [ ] Penetration testing of pagination features
- [ ] Add Web Application Firewall (WAF) rules
- [ ] Implement monitoring/alerting for abuse patterns

---

## Conclusion

While this PR addresses legitimate pagination needs and includes some positive improvements (EventSource cleanup, abort controller fixes), it introduces **severe security vulnerabilities** that make it unsuitable for production deployment.

**Final Recommendation:** ❌ **REJECT** and request security improvements before reconsidering.

The author demonstrates good coding practices in some areas (memory management, error handling) but lacks security awareness in critical areas (authentication, input validation, DoS protection). This suggests the need for:
1. Security training for the contributor
2. Mandatory security review process for all PRs
3. Automated security scanning in CI/CD pipeline

---

**Assessed by:** Security Analysis
**Date:** 2025-10-23
**Next Review:** After remediation
