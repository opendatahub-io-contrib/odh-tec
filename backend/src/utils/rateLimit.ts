/**
 * Rate limiting utility for expensive operations
 *
 * This module provides in-memory rate limiting functionality to prevent
 * abuse and DoS attacks on expensive operations like contains searches,
 * file transfers, and uploads.
 *
 * PRODUCTION NOTE: This implementation uses an in-memory Map for storage,
 * which will reset when the server restarts. For production deployments,
 * consider using Redis or another persistent storage to maintain rate
 * limits across server restarts and enable horizontal scaling.
 */

/**
 * Rate limit entry stored in memory
 */
interface RateLimitEntry {
  /** Number of requests made in current window */
  count: number;
  /** Timestamp (ms) when the rate limit window resets */
  resetAt: number;
}

/**
 * In-memory rate limit store
 * Key format: "operation:identifier" (e.g., "contains-search:192.168.1.1")
 *
 * PRODUCTION NOTE: Replace with Redis for:
 * - Persistence across server restarts
 * - Distributed rate limiting across multiple instances
 * - Better memory management and TTL support
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Maximum entries before triggering cleanup
 * Prevents unbounded memory growth in long-running processes
 */
const CLEANUP_THRESHOLD = 10000;

/**
 * Check if request should be rate limited
 *
 * This function implements a sliding window rate limiter. Each unique key
 * (typically operation:clientIP) gets its own counter that resets after
 * the specified window duration.
 *
 * @param key - Unique identifier for the rate limit (e.g., "contains-search:192.168.1.1")
 * @param max - Maximum requests allowed in the time window
 * @param windowMs - Time window in milliseconds (e.g., 60000 for 1 minute)
 * @returns true if rate limit exceeded (request should be rejected), false if allowed
 *
 * @example
 * ```typescript
 * const clientIp = req.ip || 'unknown';
 * const rateLimitKey = `contains-search:${clientIp}`;
 *
 * if (checkRateLimit(rateLimitKey, 5, 60000)) {
 *   // Rate limit exceeded - reject request
 *   reply.code(429).send({ error: 'Too many requests' });
 *   return;
 * }
 * // Request allowed - proceed
 * ```
 */
export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // Periodic cleanup to prevent memory leak
  // Only runs when store size exceeds threshold
  if (rateLimitStore.size > CLEANUP_THRESHOLD) {
    cleanupExpiredEntries(now);
  }

  // New window or expired - create new entry
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return false; // First request in window - allow
  }

  // Check if limit exceeded
  if (entry.count >= max) {
    return true; // Rate limit exceeded - reject
  }

  // Increment counter and allow request
  entry.count++;
  return false;
}

/**
 * Get time until rate limit resets for a given key
 *
 * Useful for providing "Retry-After" headers in 429 responses
 *
 * @param key - Unique identifier for the rate limit
 * @returns Number of seconds until reset (0 if no active limit)
 *
 * @example
 * ```typescript
 * if (checkRateLimit(rateLimitKey, 5, 60000)) {
 *   const retryAfter = getRateLimitResetTime(rateLimitKey);
 *   reply.code(429).send({
 *     error: 'Too many requests',
 *     retryAfter,
 *   });
 * }
 * ```
 */
export function getRateLimitResetTime(key: string): number {
  const entry = rateLimitStore.get(key);
  if (!entry) return 0;

  const now = Date.now();
  if (now > entry.resetAt) return 0;

  return Math.ceil((entry.resetAt - now) / 1000);
}

/**
 * Clean up expired rate limit entries
 *
 * Removes entries whose reset time has passed to prevent memory leaks.
 * Called automatically when store size exceeds CLEANUP_THRESHOLD.
 *
 * @param now - Current timestamp in milliseconds
 * @internal
 */
function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Clear all rate limit entries
 *
 * Useful for testing or administrative reset operations.
 * NOT recommended for production use.
 *
 * @internal
 */
export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}

/**
 * Get current rate limit store size
 *
 * Useful for monitoring and debugging
 *
 * @internal
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}
