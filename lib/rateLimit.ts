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

/** Max failed login attempts per identifier before it is soft-blocked. */
const IDENTIFIER_FLOOD_LIMIT = 10;

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
    const count = await (client as unknown as { get: (k: string) => Promise<number | null> }).get(key);
    const num = count ? Number(count) : 0;
    const allowed = num < IP_LOGIN_FAIL_LIMIT;
    return { allowed, remaining: allowed ? IP_LOGIN_FAIL_LIMIT - num : 0 };
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
export type LoginIdentifierKind = "phone" | "instagram";

function identifierFloodKey(
  kind: LoginIdentifierKind,
  identifier: string,
): string {
  return `login:${kind}:${identifier}`;
}

/**
 * Check the distributed flood guard for a normalized phone or Instagram identifier.
 */
export async function checkIdentifierFloodGuard(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<{ allowed: boolean }> {
  const client = getRedisClient();
  if (!client) return { allowed: true };

  try {
    const key = identifierFloodKey(kind, identifier);
    const count = await (client as unknown as { get: (k: string) => Promise<number | null> }).get(key);
    const num = count ? Number(count) : 0;
    return { allowed: num < IDENTIFIER_FLOOD_LIMIT };
  } catch (err) {
    console.error('[RateLimit] identifier flood check failed, failing open:', err);
    return { allowed: true };
  }
}

/**
 * Increment the normalized identifier flood counter after invalid credentials.
 * Silently ignores Redis failures.
 */
export async function recordIdentifierFloodAttempt(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const key = identifierFloodKey(kind, identifier);
    await (client as unknown as { incr: (k: string) => Promise<number> }).incr(key);
    await (client as unknown as { expire: (k: string, s: number) => Promise<number> }).expire(key, LOGIN_FAIL_TTL);
  } catch (err) {
    console.error('[RateLimit] record identifier flood failed:', err);
  }
}

/**
 * Reset the normalized identifier flood counter on successful login.
 * Silently ignores Redis failures.
 */
export async function resetIdentifierFlood(
  kind: LoginIdentifierKind,
  identifier: string,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await (client as unknown as { del: (k: string) => Promise<number> }).del(
      identifierFloodKey(kind, identifier),
    );
  } catch (err) {
    console.error('[RateLimit] reset identifier flood failed:', err);
  }
}

/** Backward-compatible phone flood check wrapper. */
export async function checkPhoneFloodGuard(phone: string): Promise<{ allowed: boolean }> {
  return checkIdentifierFloodGuard("phone", phone);
}

/** Backward-compatible phone flood increment wrapper. */
export async function recordPhoneFloodAttempt(phone: string): Promise<void> {
  return recordIdentifierFloodAttempt("phone", phone);
}

/** Backward-compatible phone flood reset wrapper. */
export async function resetPhoneFlood(phone: string): Promise<void> {
  return resetIdentifierFlood("phone", phone);
}
