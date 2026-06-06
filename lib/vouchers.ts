/**
 * Core voucher business logic.
 * All functions are pure or accept a db client — no direct prisma import at top-level.
 * Called inside prisma.$transaction() from order routes.
 */

import type { Voucher, Prisma } from "@prisma/client";

// ── Minimal types ──────────────────────────────────────────────────────────────

export interface ProcessedAddon {
  addon_option_id: string;
  quantity: number;
  unit_price_vnd: number;
}

export interface ResolvedOrderItem {
  menu_item_id: string;
  quantity: number;
  size: string;
  unit_price_vnd: number;
  addons_price_vnd: number;
  line_total: number;
  product_voucher_id: string | null;
  resolvedAddons: ProcessedAddon[];
}

export interface VoucherValidationResult {
  voucher: Voucher;
  discount_vnd: number;
}

export interface ApplyVouchersResult {
  /** Discount voucher id to link to the order */
  discount_voucher_id: string | null;
  /** ADDON voucher id to link to the order (future: store on order_items) */
  addon_voucher_id: string | null;
  /** Total VND reduced from subtotal by DISCOUNT voucher */
  discount_vnd: number;
  /** Points to award back to customer because PRODUCT voucher covered more than actual item price */
  surplus_points: number;
}

export type DbClientForVoucher = {
  voucher: {
    findUnique: (args: {
      where: { id?: string; qr_token?: string };
    }) => Promise<Voucher | null>;
  };
};

// ── Errors ────────────────────────────────────────────────────────────────────

export class VoucherError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "VoucherError";
  }
}

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Validates a voucher against the current user and time.
 * Throws VoucherError on any invalid state.
 * Does NOT compute discount — returns the raw voucher.
 */
export function assertVoucherUsable(
  voucher: Voucher | null,
  userId: string,
  expectedType: Voucher["voucher_type"]
): void {
  if (!voucher || voucher.user_id !== userId) {
    throw new VoucherError("NOT_FOUND", "Voucher not found or does not belong to you");
  }
  if (voucher.status === "REDEEMED") {
    throw new VoucherError("VOUCHER_REDEEMED", "Voucher has already been used");
  }
  if (voucher.status === "EXPIRED" || voucher.status === "REFUNDED") {
    throw new VoucherError("VOUCHER_EXPIRED", "Voucher is no longer valid");
  }
  if ((voucher.status as string) === "RESERVED") {
    throw new VoucherError("CONFLICT", "Voucher is already reserved for another pending order");
  }
  if (voucher.expires_at !== null && voucher.expires_at <= new Date()) {
    throw new VoucherError("VOUCHER_EXPIRED", "Voucher has expired");
  }
  if (voucher.voucher_type !== expectedType) {
    throw new VoucherError(
      "VALIDATION_ERROR",
      `Expected voucher type ${expectedType}, got ${voucher.voucher_type}`
    );
  }
}

// ── DISCOUNT voucher calculation ──────────────────────────────────────────────

/**
 * Computes the discount_vnd for a DISCOUNT voucher against a subtotal.
 * PERCENT: floor(subtotal × value / 100). FIXED: min(value, subtotal).
 * Returns 0 if voucher has no valid discount data.
 */
export function calcDiscountVoucher(
  voucher: Pick<Voucher, "discount_type" | "discount_value">,
  subtotal_vnd: number
): number {
  if (voucher.discount_type === "PERCENT" && voucher.discount_value !== null) {
    const rawDiscount = (subtotal_vnd * voucher.discount_value) / 100;
    return Math.floor(rawDiscount / 1000) * 1000;
  }
  if (voucher.discount_type === "FIXED" && voucher.discount_value !== null) {
    return Math.min(voucher.discount_value, subtotal_vnd);
  }
  return 0;
}

// ── PRODUCT voucher surplus ───────────────────────────────────────────────────

/**
 * Computes surplus points when a PRODUCT voucher covers more than the actual item price.
 * Formula: floor((covered_price_vnd - actual_price) / 10000)
 * Returns 0 when actual_price >= covered_price_vnd (no surplus).
 */
export function calcProductVoucherSurplusPoints(
  covered_price_vnd: number,
  actual_item_price_vnd: number
): number {
  const surplus = covered_price_vnd - actual_item_price_vnd;
  if (surplus <= 0) return 0;
  return Math.floor(surplus / 10000);
}

// ── ADDON voucher matching ────────────────────────────────────────────────────

/**
 * Finds the first order item that contains the target addon_option_id.
 * Returns the addon unit_price_vnd for that item, or 0 if not found.
 *
 * Rules:
 * - Applies to the FIRST matching item only.
 * - Does NOT apply to extra matcha (gram_value !== null) — check done at route level.
 */
export function findAddonVoucherDiscount(
  items: ResolvedOrderItem[],
  target_addon_option_id: string
): number {
  for (const item of items) {
    const matchingAddon = item.resolvedAddons.find(
      (a) => a.addon_option_id === target_addon_option_id
    );
    if (matchingAddon) {
      return matchingAddon.unit_price_vnd;
    }
  }
  return 0;
}

// ── Points earned calculation ─────────────────────────────────────────────────

/**
 * Computes points earned for a completed order.
 * Formula: floor(total_vnd / 10000)
 * Always returns an integer. Anonymous orders must pass 0 directly.
 */
export function calcPointsEarned(total_vnd: number): number {
  return Math.floor(total_vnd / 10000);
}

// ── Multi DISCOUNT voucher calculation ───────────────────────────────────────

/**
 * Calculates total discount from multiple DISCOUNT vouchers.
 * Rule: nhiều FIXED + tối đa 1 PERCENT.
 * Order: all FIXED first (trừ lần lượt), then 1 PERCENT on remaining amount.
 * Result capped so subtotal never goes below 0.
 * @returns total discount amount (NOT the remaining subtotal)
 */
export function calcMultiDiscountVouchers(
  vouchers: Pick<Voucher, "discount_type" | "discount_value">[],
  subtotal_vnd: number
): number {
  let remaining = subtotal_vnd;

  // 1. Apply all FIXED first
  for (const v of vouchers) {
    if (v.discount_type === "FIXED" && v.discount_value !== null) {
      remaining = Math.max(0, remaining - v.discount_value);
    }
  }

  // 2. Apply the single PERCENT voucher (if any)
  const percentVoucher = vouchers.find(
    (v) => v.discount_type === "PERCENT" && v.discount_value !== null
  );
  if (percentVoucher && percentVoucher.discount_value !== null) {
    const pct = Math.min(percentVoucher.discount_value, 100);
    const rawDiscount = (remaining * pct) / 100;
    const roundedDiscount = Math.floor(rawDiscount / 1000) * 1000;
    remaining = Math.max(0, remaining - roundedDiscount);
  }

  return subtotal_vnd - remaining;
}

/**
 * Finds the addon discount for a specific order item with an ADDON voucher.
 * Returns the unit_price_vnd of the matching addon on that specific item, or 0 if not found.
 */
export function findItemAddonVoucherDiscount(
  item: ResolvedOrderItem,
  target_addon_option_id: string
): number {
  const matchingAddon = item.resolvedAddons.find(
    (a) => a.addon_option_id === target_addon_option_id
  );
  return matchingAddon ? matchingAddon.unit_price_vnd : 0;
}
