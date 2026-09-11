/**
 * voucherMatchUtils — Pure client-side voucher-to-cart matching helpers.
 *
 * All functions are pure (no DB, no API calls). Input comes from cached
 * listMyVouchers() and the Zustand cart store.
 */

import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartItem, ProjectedCartLine } from "@/src/lib/types/cart";

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

export interface AddonVoucherTargetChoice {
  addonOptionId: string;
  label: string;
  discountVnd: number;
}

/** Return every usable ADDON target, optionally constrained to options selected on a drink. */
export function getAddonVoucherTargetChoices(
  voucher: MyVoucher,
  selectedOptionIds?: readonly string[],
  excludedOptionIds: readonly string[] = [],
  addonPrices: Readonly<Record<string, number>> = {},
): AddonVoucherTargetChoice[] {
  const excluded = new Set(excludedOptionIds);
  const configuredTargets = voucher.eligible_addon_options;
  if (configuredTargets && configuredTargets.length > 0) {
    return configuredTargets
      .filter((option) =>
        option.is_active &&
        !option.is_dynamic_gram &&
        !excluded.has(option.addon_option_id) &&
        (selectedOptionIds === undefined || selectedOptionIds.includes(option.addon_option_id)),
      )
      .map((option) => ({
        addonOptionId: option.addon_option_id,
        label: option.label,
        discountVnd: addonPrices[option.addon_option_id] ?? option.price_vnd,
      }));
  }
  if (!voucher.addon_option_id) return [];
  return !excluded.has(voucher.addon_option_id) &&
    (selectedOptionIds === undefined || selectedOptionIds.includes(voucher.addon_option_id))
    ? [{
        addonOptionId: voucher.addon_option_id,
        label: voucher.addonOption?.label ?? "Topping",
        discountVnd: addonPrices[voucher.addon_option_id] ?? 0,
      }]
    : [];
}

/** Resolve the first usable ADDON target for legacy single-target call sites. */
export function resolveAddonVoucherOptionId(
  voucher: MyVoucher,
  selectedOptionIds?: readonly string[],
  excludedOptionIds: readonly string[] = [],
): string | null {
  return getAddonVoucherTargetChoices(voucher, selectedOptionIds, excludedOptionIds)[0]?.addonOptionId ?? null;
}

/** Resolve the ADDON target already applied to a cart line or the next uncovered eligible target. */
export function resolveAddonVoucherOptionForCartItem(voucher: MyVoucher, item: ProjectedCartLine): string | null {
  const applied = item.addonVouchers.find((entry) => entry.token === voucher.qr_token);
  return applied?.addonOptionId ?? getAddonVoucherTargetChoices(
    voucher,
    item.configuration.size === null ? [] : item.configuration.addonOptionIds,
    item.addonVouchers.map((entry) => entry.addonOptionId),
    Object.fromEntries(item.resolvedAddons.map((addon) => [addon.id, addon.priceVnd])),
  )[0]?.addonOptionId ?? null;
}

/** Return the PRODUCT or ITEM voucher token currently attached to one cart line. */
export function getAppliedMenuVoucherId(item: CartItem): string | null {
  return item.lineVoucher?.token ?? null;
}

/** Snapshot the voucher-to-addon target allocation already stored on one cart line. */
export function getCartAddonVoucherTargets(item?: CartItem): Record<string, string> {
  return Object.fromEntries((item?.addonVouchers ?? []).map((entry) => [entry.token, entry.addonOptionId]));
}

/** Return whether an addon option on a cart line is already paid by another voucher. */
export function hasAddonVoucherForOption(item: CartItem, addonOptionId: string): boolean {
  return item.addonVouchers?.some((entry) => entry.addonOptionId === addonOptionId) ?? false;
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
    (v) => (
      (v.eligible_menu_items?.length ?? 0) > 0
        ? v.eligible_menu_items!.some((target) => target.menu_item_id === menuItemId && target.is_available)
        : v.menu_item_id === menuItemId
    ) && !usedVoucherIds.has(v.qr_token)
  );
}

/**
 * Builds a map of menuItemId → applicable PRODUCT vouchers for all cart items.
 * Each voucher appears only once (first cart item match wins for deduplication display,
 * but the user can still manually assign any voucher to any matching item).
 */
export function buildProductVoucherMap(
  vouchers: MyVoucher[],
  cartItems: ProjectedCartLine[]
): Map<string, MyVoucher[]> {
  const usable = vouchers.filter(
    (voucher) =>
      (voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "PRODUCT_DISCOUNT" || voucher.voucher_type === "ITEM") &&
      isVoucherUsable(voucher),
  );
  const result = new Map<string, MyVoucher[]>();
  for (const item of cartItems) {
    const matches = usable.filter((v) =>
      ((v.eligible_menu_items?.length ?? 0) > 0
        ? v.eligible_menu_items!.some((target) => target.menu_item_id === item.menuItemId)
        : v.menu_item_id === item.menuItemId) &&
      (v.voucher_type !== "PRODUCT_DISCOUNT" || (item.configuration.size !== null && (v.eligible_sizes ?? []).includes(item.configuration.size))));
    if (matches.length > 0) {
      result.set(item.menuItemId, matches);
    }
  }
  return result;
}

// ── ADDON voucher matching ────────────────────────────────────────────────────

/**
 * Returns usable ADDON vouchers whose addon_option_id appears in any cart item's
 * selectedOptionIds. Excludes already-used vouchers.
 */
export function matchAddonVouchers(
  vouchers: MyVoucher[],
  cartItems: ProjectedCartLine[],
  usedVoucherIds: Set<string> = new Set()
): MyVoucher[] {
  const allOptionIds = new Set(cartItems.flatMap((item) => item.configuration.size === null ? [] : item.configuration.addonOptionIds));
  return filterUsableVouchers(vouchers, "ADDON").filter(
    (v) => resolveAddonVoucherOptionId(v, Array.from(allOptionIds)) !== null && !usedVoucherIds.has(v.qr_token)
  );
}

/**
 * Builds a map of cartId → applicable ADDON vouchers for all cart items.
 */
export function buildAddonVoucherMap(
  vouchers: MyVoucher[],
  cartItems: ProjectedCartLine[]
): Map<string, MyVoucher[]> {
  const usable = filterUsableVouchers(vouchers, "ADDON");
  const result = new Map<string, MyVoucher[]>();
  for (const item of cartItems) {
    if (item.category === "extras") continue;
    const matches = usable.filter((voucher) => resolveAddonVoucherOptionForCartItem(voucher, item) !== null);
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
  cartItemClientPrice: number,
  menuItemId?: string,
): number {
  const covered = voucher.eligible_menu_items?.find((target) => target.menu_item_id === menuItemId)?.covered_price_vnd
    ?? voucher.covered_price_vnd
    ?? 0;
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
    let discount = Math.floor(((remaining * pct) / 100) / 1000) * 1000;
    if ("max_discount_vnd" in percentVoucher && percentVoucher.max_discount_vnd != null) {
      discount = Math.min(discount, percentVoucher.max_discount_vnd as number);
    }
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
  cartItems: ProjectedCartLine[]
): number {
  const targetIds = voucher.eligible_addon_options?.length
    ? voucher.eligible_addon_options.filter((option) => option.is_active && !option.is_dynamic_gram).map((option) => option.addon_option_id)
    : voucher.addon_option_id ? [voucher.addon_option_id] : [];
  for (const item of cartItems) {
    const configuration = item.configuration;
    if (configuration.size !== null && targetIds.some((optionId) => configuration.addonOptionIds.includes(optionId))) {
      return item.resolvedAddons.find((addon) => targetIds.includes(addon.id))?.priceVnd ?? 0;
    }
  }
  return 0;
}
