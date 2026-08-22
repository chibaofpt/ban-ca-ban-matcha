/**
 * voucherMatchUtils — Pure client-side voucher-to-cart matching helpers.
 *
 * All functions are pure (no DB, no API calls). Input comes from cached
 * listMyVouchers() and the Zustand cart store.
 */

import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartItem } from "@/src/lib/types/cart";

// ── Eligibility filters ───────────────────────────────────────────────────────

/** Returns true if a voucher is ACTIVE and not expired at the given timestamp. */
export function isVoucherUsable(voucher: MyVoucher, now: Date = new Date()): boolean {
  if (voucher.status !== "ACTIVE") return false;
  if (!voucher.availability.can_apply) return false;
  if (voucher.expires_at !== null && new Date(voucher.expires_at) <= now) return false;
  return true;
}

/** Filters to only ACTIVE + non-expired vouchers of the given type. */
export function filterUsableVouchers(
  vouchers: MyVoucher[],
  type: MyVoucher["voucher_type"]
): MyVoucher[] {
  const now = new Date();
  return vouchers.filter((v) => v.voucher_type === type && isVoucherUsable(v, now));
}

// ── PRODUCT voucher matching ──────────────────────────────────────────────────

/**
 * Returns usable PRODUCT vouchers whose menu_item_id matches the given cart item's
 * menuItemId (soft match — size difference is intentional: customer pays surplus).
 *
 * Excludes vouchers already applied to another cart item (via usedVoucherIds).
 */
export function matchProductVouchers(
  vouchers: MyVoucher[],
  menuItemId: string,
  usedVoucherIds: Set<string> = new Set()
): MyVoucher[] {
  return filterUsableVouchers(vouchers, "PRODUCT").filter(
    (v) => v.menu_item_id === menuItemId && !usedVoucherIds.has(v.qr_token)
  );
}

/**
 * Builds a map of menuItemId → applicable PRODUCT vouchers for all cart items.
 * Each voucher appears only once (first cart item match wins for deduplication display,
 * but the user can still manually assign any voucher to any matching item).
 */
export function buildProductVoucherMap(
  vouchers: MyVoucher[],
  cartItems: CartItem[]
): Map<string, MyVoucher[]> {
  const usable = vouchers.filter(
    (voucher) =>
      (voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "ITEM") &&
      isVoucherUsable(voucher),
  );
  const result = new Map<string, MyVoucher[]>();
  for (const item of cartItems) {
    const matches = usable.filter((v) => v.menu_item_id === item.menuItemId);
    if (matches.length > 0) {
      result.set(item.menuItemId, matches);
    }
  }
  return result;
}

// ── ADDON voucher matching ────────────────────────────────────────────────────

/**
 * Returns usable ADDON vouchers whose addon_option_id appears in any cart item's
 * selectedOptionIds or quantityAddonOptions. Excludes already-used vouchers.
 */
export function matchAddonVouchers(
  vouchers: MyVoucher[],
  cartItems: CartItem[],
  usedVoucherIds: Set<string> = new Set()
): MyVoucher[] {
  const allOptionIds = new Set(
    cartItems.flatMap((c) => [
      ...c.selectedOptionIds,
      ...c.quantityAddonOptions.map((q) => q.option_id),
    ])
  );
  return filterUsableVouchers(vouchers, "ADDON").filter(
    (v) => v.addon_option_id !== null && allOptionIds.has(v.addon_option_id) && !usedVoucherIds.has(v.qr_token)
  );
}

/**
 * Builds a map of cartId → applicable ADDON vouchers for all cart items.
 */
export function buildAddonVoucherMap(
  vouchers: MyVoucher[],
  cartItems: CartItem[]
): Map<string, MyVoucher[]> {
  const usable = filterUsableVouchers(vouchers, "ADDON");
  const result = new Map<string, MyVoucher[]>();
  for (const item of cartItems) {
    const itemOptionIds = new Set([
      ...item.selectedOptionIds,
      ...item.quantityAddonOptions.map((q) => q.option_id),
    ]);
    const appliedOptionIds = new Set(item.addonVouchers?.map(av => av.addonOptionId) || []);
    
    const matches = usable.filter(
      (v) => v.addon_option_id !== null && itemOptionIds.has(v.addon_option_id) && !appliedOptionIds.has(v.addon_option_id)
    );
    if (matches.length > 0) {
      result.set(item.cartId, matches);
    }
  }
  return result;
}

// ── Price preview helpers ─────────────────────────────────────────────────────

/**
 * Estimates how much a PRODUCT voucher saves on a given cart item.
 * The voucher covers up to covered_price_vnd; the customer pays any surplus.
 * Returns the discount amount (never negative, never exceeds item price).
 */
export function estimateProductSavings(
  voucher: MyVoucher,
  cartItemClientPrice: number
): number {
  const covered = voucher.covered_price_vnd ?? 0;
  return Math.min(covered, cartItemClientPrice);
}

/**
 * Estimates the DISCOUNT voucher saving on a given subtotal.
 * PERCENT: floor(subtotal × value / 100). FIXED: min(value, subtotal).
 */
export function estimateDiscountSavings(voucher: MyVoucher, subtotal: number): number {
  if (voucher.discount_type === "PERCENT") {
    return Math.floor((subtotal * (voucher.discount_value ?? 0)) / 100);
  }
  if (voucher.discount_type === "FIXED") {
    return Math.min(voucher.discount_value ?? 0, subtotal);
  }
  return 0;
}

/**
 * Estimates total saving from multiple DISCOUNT vouchers — mirrors server calcMultiDiscountVouchers.
 * Rule: all FIXED applied first (sequentially), then at most 1 PERCENT on the remainder.
 * Result is capped so subtotal never goes below 0.
 */
export function estimateMultiDiscountSavings(
  vouchers: Array<Pick<MyVoucher, "discount_type" | "discount_value">>,
  subtotal: number
): number {
  let remaining = subtotal;

  // 1. Apply all FIXED vouchers first
  for (const v of vouchers) {
    if (v.discount_type === "FIXED" && (v.discount_value ?? 0) > 0) {
      remaining = Math.max(0, remaining - (v.discount_value ?? 0));
    }
  }

  // 2. Apply the single PERCENT voucher (if any)
  const percentVoucher = vouchers.find((v) => v.discount_type === "PERCENT");
  if (percentVoucher && (percentVoucher.discount_value ?? 0) > 0) {
    const pct = Math.min(percentVoucher.discount_value ?? 0, 100);
    const discount = Math.floor(((remaining * pct) / 100) / 1000) * 1000;
    remaining = Math.max(0, remaining - discount);
  }

  return subtotal - remaining;
}

/**
 * Estimates the ADDON voucher saving: the addon option's price for the first
 * cart item that contains the matching addon_option_id.
 * Returns 0 if no matching item is found.
 */
export function estimateAddonSavings(
  voucher: MyVoucher,
  cartItems: CartItem[]
): number {
  if (!voucher.addon_option_id) return 0;
  for (const item of cartItems) {
    if (item.selectedOptionIds.includes(voucher.addon_option_id)) {
      // We don't have individual addon prices in CartItem — the server will compute.
      // Return a non-zero signal (1) so the UI can show "Voucher topping áp dụng".
      // Actual deduction is confirmed server-side.
      return 1;
    }
  }
  return 0;
}
