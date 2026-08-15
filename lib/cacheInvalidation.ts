import { invalidateCache, CACHE_KEYS } from './cache';

// ---------------------------------------------------------------------------
// Admin cache invalidation helpers
// Called after successful DB writes in admin routes.
// ---------------------------------------------------------------------------

/** Invalidate all menu-related caches (menu items, powders, addons, milk, sizes). */
export async function invalidateMenuCaches(): Promise<void> {
  await invalidateCache(
    CACHE_KEYS.MENU,
    CACHE_KEYS.POWDERS,
    CACHE_KEYS.ADDON_GROUPS,
    CACHE_KEYS.MILK_TYPES,
    CACHE_KEYS.BASE_LIQUIDS,
    CACHE_KEYS.DEFAULT_SIZE_CONFIG,
  );
}

/** Invalidate store schedule/closure caches. */
export async function invalidateStoreCaches(): Promise<void> {
  await invalidateCache(CACHE_KEYS.STORE_STATUS);
}

/** Invalidate voucher package caches. */
export async function invalidateVoucherCaches(): Promise<void> {
  await invalidateCache(CACHE_KEYS.VOUCHER_PACKAGES);
}
