import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Distributed rate limiting via Upstash — Edge Runtime compatible.
// Replaces the broken in-memory Map-based rate limiter.
// ---------------------------------------------------------------------------

/** Lazy-initialized Redis client for rate limiting (separate from lib/redis.ts to stay Edge-safe) */
let redis: Redis | null = null;

/** Returns Redis client for rate limiting, or null if env vars missing */
function getRateLimitRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  redis = new Redis({ url, token });
  return redis;
}

/** Auth routes: 10 requests per 60 seconds per IP (sliding window) */
export function getAuthRateLimit(): Ratelimit | null {
  const client = getRateLimitRedis();
  if (!client) return null;

  return new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(10, '60 s'),
    prefix: 'rl:auth',
    analytics: false, // save commands on free tier
  });
}

/**
 * Check rate limit for a given identifier (e.g. IP address).
 * Returns { allowed, remaining } or { allowed: true } if Redis is unavailable (fail-open).
 */
export async function checkDistributedRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const limiter = getAuthRateLimit();

  if (!limiter) {
    // Redis unavailable → fail-open (allow request through)
    return { allowed: true, remaining: -1 };
  }

  try {
    const result = await limiter.limit(identifier);
    return { allowed: result.success, remaining: result.remaining };
  } catch (err) {
    console.error('[RateLimit] Redis check failed, failing open:', err);
    return { allowed: true, remaining: -1 };
  }
}
