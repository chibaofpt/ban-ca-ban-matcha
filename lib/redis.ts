import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Singleton Redis client — NEVER import @upstash/redis elsewhere in the app.
// All Redis operations go through this wrapper (Adapter/Wrapper Pattern).
// ---------------------------------------------------------------------------

/** Lazy-initialized Redis client (undefined when env vars missing) */
let redis: Redis | null = null;

/** Returns the Redis client, or null if env vars are missing */
function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn('[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set — Redis disabled');
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

// ---------------------------------------------------------------------------
// Core operations — all gracefully degrade on failure
// ---------------------------------------------------------------------------

/** Get a cached value by key. Returns null on miss or Redis failure. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const value = await client.get<T>(key);
    return value ?? null;
  } catch {
    console.error('[Redis] cacheGet failed');
    return null;
  }
}

/** Set a cached value with TTL (seconds). Silently fails if Redis unavailable. */
export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.set(key, value, { ex: ttlSeconds });
  } catch {
    console.error('[Redis] cacheSet failed');
  }
}

/** Delete one or more cache keys. Silently fails if Redis unavailable. */
export async function cacheDelete(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client || keys.length === 0) return;

  try {
    await client.del(...keys);
  } catch {
    console.error('[Redis] cacheDelete failed');
  }
}

/** Check if Redis is healthy and reachable. */
export async function isRedisHealthy(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/** Expose raw Redis client for @upstash/ratelimit integration only. */
export function getRedisClient(): Redis | null {
  return getRedis();
}
