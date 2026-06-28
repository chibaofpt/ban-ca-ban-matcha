import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRedisClient } from '@/lib/redis';

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

// ---------------------------------------------------------------------------
// Login-specific rate limits — keyed by IP and phone separately.
// Uses raw Redis incr/expire/del so counters only increment on wrong password.
// ---------------------------------------------------------------------------

/** Max failed login attempts per IP before that IP is blocked. */
const IP_LOGIN_FAIL_LIMIT = 5;

/** Max failed login attempts per phone number (across all IPs) before phone is soft-blocked. */
const PHONE_FLOOD_LIMIT = 10;

/** TTL for both counters in seconds (15 minutes). */
const LOGIN_FAIL_TTL = 900;

/**
 * Check IP-based login fail counter. Returns allowed=false if IP has reached the limit.
 * Fail-open: returns { allowed: true, remaining: -1 } if Redis is unavailable.
 */
export async function checkLoginFailLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const client = getRedisClient();
  if (!client) return { allowed: true, remaining: -1 };

  try {
    const key = `login:fail:${ip}`;
    // incr returns current count after increment — used as a read+write in one command
    const count = await (client as unknown as { incr: (k: string) => Promise<number> }).incr(key);
    // Set TTL on every call so the window resets from the last attempt
    await (client as unknown as { expire: (k: string, s: number) => Promise<number> }).expire(key, LOGIN_FAIL_TTL);
    const allowed = count < IP_LOGIN_FAIL_LIMIT;
    return { allowed, remaining: allowed ? IP_LOGIN_FAIL_LIMIT - count : 0 };
  } catch (err) {
    console.error('[RateLimit] checkLoginFailLimit failed, failing open:', err);
    return { allowed: true, remaining: -1 };
  }
}

/**
 * Increment the IP login fail counter. Call only when a login attempt fails due to wrong password.
 * Silently ignores Redis failures.
 */
export async function recordLoginFail(ip: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const key = `login:fail:${ip}`;
    await (client as unknown as { incr: (k: string) => Promise<number> }).incr(key);
    await (client as unknown as { expire: (k: string, s: number) => Promise<number> }).expire(key, LOGIN_FAIL_TTL);
  } catch (err) {
    console.error('[RateLimit] recordLoginFail failed:', err);
  }
}

/**
 * Reset the IP login fail counter on successful login.
 * Silently ignores Redis failures.
 */
export async function resetLoginFail(ip: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await (client as unknown as { del: (k: string) => Promise<number> }).del(`login:fail:${ip}`);
  } catch (err) {
    console.error('[RateLimit] resetLoginFail failed:', err);
  }
}

/**
 * Check phone-based flood guard. Returns allowed=false if this phone has received
 * too many failed attempts across all IPs (distributed attack defence).
 * Fail-open: returns { allowed: true } if Redis is unavailable.
 */
export async function checkPhoneFloodGuard(
  phone: string,
): Promise<{ allowed: boolean }> {
  const client = getRedisClient();
  if (!client) return { allowed: true };

  try {
    const key = `login:phone:${phone}`;
    const count = await (client as unknown as { incr: (k: string) => Promise<number> }).incr(key);
    await (client as unknown as { expire: (k: string, s: number) => Promise<number> }).expire(key, LOGIN_FAIL_TTL);
    return { allowed: count < PHONE_FLOOD_LIMIT };
  } catch (err) {
    console.error('[RateLimit] checkPhoneFloodGuard failed, failing open:', err);
    return { allowed: true };
  }
}

/**
 * Increment the phone flood counter. Call only on wrong password attempts.
 * Silently ignores Redis failures.
 */
export async function recordPhoneFloodAttempt(phone: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const key = `login:phone:${phone}`;
    await (client as unknown as { incr: (k: string) => Promise<number> }).incr(key);
    await (client as unknown as { expire: (k: string, s: number) => Promise<number> }).expire(key, LOGIN_FAIL_TTL);
  } catch (err) {
    console.error('[RateLimit] recordPhoneFloodAttempt failed:', err);
  }
}

/**
 * Reset the phone flood counter on successful login.
 * Silently ignores Redis failures.
 */
export async function resetPhoneFlood(phone: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await (client as unknown as { del: (k: string) => Promise<number> }).del(`login:phone:${phone}`);
  } catch (err) {
    console.error('[RateLimit] resetPhoneFlood failed:', err);
  }
}
