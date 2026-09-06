import { cacheGet, cacheSet, cacheDelete } from './redis';

// ---------------------------------------------------------------------------
// Cache key constants — all keys are prefixed for easy debugging on Upstash
// ---------------------------------------------------------------------------

export const CACHE_KEYS = {
  MENU: 'cache:menu:v4',
  POWDERS: 'cache:powders',
  ADDON_GROUPS: 'cache:addon-groups',
  MILK_TYPES: 'cache:milk-types',
  BASE_LIQUIDS: 'cache:base-liquids',
  STORE_STATUS: 'cache:store-status',
  VOUCHER_PACKAGES: 'cache:voucher-packages',
  DEFAULT_SIZE_CONFIG: 'cache:default-size-config',
} as const;

/** TTL values in seconds for each cache key */
export const CACHE_TTL = {
  MENU: 600,              // 10 minutes — menu changes rarely
  POWDERS: 600,           // 10 minutes
  ADDON_GROUPS: 600,      // 10 minutes
  MILK_TYPES: 600,        // 10 minutes
  STORE_STATUS: 60,       // 1 minute — store can close/open anytime
  VOUCHER_PACKAGES: 300,  // 5 minutes
  DEFAULT_SIZE_CONFIG: 600, // 10 minutes
  SESSION: 900,           // 15 minutes — matches access token TTL
} as const;

// ---------------------------------------------------------------------------
// Cache-aside pattern — the core caching utility
// ---------------------------------------------------------------------------

/**
 * Cache-aside: check Redis first → on miss, call fetchFn → store result.
 * Gracefully degrades: if Redis is down, fetchFn runs directly (no cache).
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  // Try cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  // Cache miss (or Redis down) → fetch from source
  const fresh = await fetchFn();

  // Store in cache — awaited to ensure warm even on fast serverless cold-starts
  await cacheSet(key, fresh, ttlSeconds);

  return fresh;
}

// ---------------------------------------------------------------------------
// Tag-based cache invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate one or more cache keys. Silently fails if Redis unavailable.
 * TTL acts as safety net if invalidation fails.
 */
export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  try {
    await cacheDelete(...keys);
  } catch (err) {
    // Redis fail → cache will expire naturally via TTL
    console.error('[Cache] Invalidation failed, TTL will handle expiry:', keys, err);
  }
}
