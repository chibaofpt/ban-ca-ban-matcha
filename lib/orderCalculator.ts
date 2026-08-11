/**
 * Shared order calculator — unified pricing pipeline.
 * PRODUCT → ADDON → DISCOUNT → FREESHIP
 *
 * Pure function: no DB access, no side effects.
 * Used by both customer POST /api/orders and staff POST /api/staff/orders.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Input item for the calculator */
export interface CalcOrderItem {
  menu_item_id: string;
  unit_price_vnd: number;
  addons_price_vnd: number;
  quantity: number;
  line_total: number;
  /** Server-evaluated BUNDLE reward on this line, applied before every legacy voucher. */
  bundle_discount_vnd?: number;
  product_voucher_id: string | null;
  product_voucher_covered_vnd: number;
  addon_vouchers: Array<{
    voucher_id: string;
    addon_option_id: string;
    covered_price_vnd: number;
    /** Current server price of the matched addon unit. */
    unit_price_vnd?: number;
    gram_value?: number | null;
  }>;
}

/** Discount voucher config */
export interface CalcDiscountVoucher {
  id: string;
  discount_type: "FIXED" | "PERCENT";
  discount_value: number;
  min_order_vnd: number | null;
}

/** Freeship voucher config */
export interface CalcFreeshipVoucher {
  id: string;
  covered_delivery_fee_vnd: number;
  min_order_vnd: number | null;
}

/** Input for calcOrderTotals */
export interface CalcOrderInput {
  items: CalcOrderItem[];
  discountVouchers: CalcDiscountVoucher[];
  freeshipVoucher: CalcFreeshipVoucher | null;
  shipping_fee_vnd: number;
}

/** Output of calcOrderTotals */
export interface CalcOrderResult {
  subtotal_vnd: number;
  items_discount_vnd: number;
  discountable_subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  order_surplus_vnd: number;
  /** Applied item-level voucher amounts, aligned with input.items by index. */
  itemResults: CalcItemVoucherResult[];
  appliedVoucherIds: string[];
  skippedVoucherIds: string[];
}

/** Applied voucher amounts for one input order item. */
export interface CalcItemVoucherResult {
  bundle_discount_vnd?: number;
  product_voucher_id: string | null;
  product_voucher_discount_vnd: number;
  addon_vouchers: Array<{
    voucher_id: string;
    addon_option_id: string;
    discount_applied_vnd: number;
  }>;
  total_discount_vnd: number;
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Calculates item-level PRODUCT and ADDON discounts.
 * PRODUCT credit caps at unit_price_vnd — never spills into addon.
 * ADDON blocks Extra Matcha (gram_value > 0) and duplicate addon_option_id.
 * Returns { discount, surplus } — surplus is aggregate PRODUCT surplus VND.
 */
function calcItemDiscounts(
  items: CalcOrderItem[],
  appliedIds: string[],
  skippedIds: string[]
): { discount: number; surplus: number; itemResults: CalcItemVoucherResult[] } {
  let totalItemsDiscount = 0;
  let totalSurplus = 0;
  const itemResults: CalcItemVoucherResult[] = [];

  for (const item of items) {
    const bundleDiscount = Math.min(
      item.line_total,
      Math.max(0, item.bundle_discount_vnd ?? 0),
    );
    let productVoucherId: string | null = null;
    let productVoucherDiscount = 0;
    const addonResults: CalcItemVoucherResult["addon_vouchers"] = [];

    // ── PRODUCT ──
    if (item.product_voucher_id) {
      const covered = item.product_voucher_covered_vnd;
      // Cap at drink price only — never spill into addon
      const productDiscount = Math.min(covered, item.unit_price_vnd);
      const itemSurplus = Math.max(0, covered - item.unit_price_vnd);

      if (productDiscount > 0 || itemSurplus > 0) {
        totalItemsDiscount += productDiscount;
        totalSurplus += itemSurplus;
        appliedIds.push(item.product_voucher_id);
        productVoucherId = item.product_voucher_id;
        productVoucherDiscount = productDiscount;
      } else {
        skippedIds.push(item.product_voucher_id);
      }
    }

    // ── ADDON ──
    const seenAddonOptionIds = new Set<string>();

    for (const av of item.addon_vouchers) {
      // Block Extra Matcha (gram_value > 0)
      if (av.gram_value && av.gram_value > 0) {
        skippedIds.push(av.voucher_id);
        continue;
      }

      // Block duplicate addon_option_id
      if (seenAddonOptionIds.has(av.addon_option_id)) {
        skippedIds.push(av.voucher_id);
        continue;
      }

      // Credit cannot exceed the current price of the one matched addon unit.
      const addonPrice = av.unit_price_vnd ?? av.covered_price_vnd;
      const addonDiscount = Math.min(av.covered_price_vnd, addonPrice);

      // Block zero benefit
      if (addonDiscount <= 0) {
        skippedIds.push(av.voucher_id);
        continue;
      }

      seenAddonOptionIds.add(av.addon_option_id);
      totalItemsDiscount += addonDiscount;
      appliedIds.push(av.voucher_id);
      addonResults.push({
        voucher_id: av.voucher_id,
        addon_option_id: av.addon_option_id,
        discount_applied_vnd: addonDiscount,
      });
    }

    itemResults.push({
      ...(bundleDiscount > 0 ? { bundle_discount_vnd: bundleDiscount } : {}),
      product_voucher_id: productVoucherId,
      product_voucher_discount_vnd: productVoucherDiscount,
      addon_vouchers: addonResults,
      total_discount_vnd:
        bundleDiscount +
        productVoucherDiscount +
        addonResults.reduce((sum, voucher) => sum + voucher.discount_applied_vnd, 0),
    });
    totalItemsDiscount += bundleDiscount;
  }

  return { discount: totalItemsDiscount, surplus: totalSurplus, itemResults };
}

/**
 * Calculates DISCOUNT voucher totals on discountable_subtotal.
 * FIXED applied in array order, PERCENT always last, floored to nearest 1000đ.
 */
function calcDiscountTotals(
  discountVouchers: CalcDiscountVoucher[],
  discountableSubtotal: number,
  appliedIds: string[],
  skippedIds: string[]
): number {
  if (discountableSubtotal <= 0) {
    for (const v of discountVouchers) {
      skippedIds.push(v.id);
    }
    return 0;
  }

  // Separate FIXED and PERCENT
  const fixedVouchers = discountVouchers.filter((v) => v.discount_type === "FIXED");
  const percentVouchers = discountVouchers.filter((v) => v.discount_type === "PERCENT");

  let totalDiscount = 0;
  let remaining = discountableSubtotal;

  // Apply FIXED in order
  for (const v of fixedVouchers) {
    // Check min_order_vnd against discountable_subtotal
    if (v.min_order_vnd !== null && discountableSubtotal < v.min_order_vnd) {
      skippedIds.push(v.id);
      continue;
    }

    const discount = Math.min(v.discount_value, remaining);
    if (discount <= 0) {
      skippedIds.push(v.id);
      continue;
    }

    totalDiscount += discount;
    remaining -= discount;
    appliedIds.push(v.id);
  }

  // Apply PERCENT (max one, always after all FIXED)
  const [percentVoucher, ...extraPercentVouchers] = percentVouchers;
  for (const extraVoucher of extraPercentVouchers) {
    skippedIds.push(extraVoucher.id);
  }

  if (percentVoucher) {
    const v = percentVoucher;
    if (v.min_order_vnd !== null && discountableSubtotal < v.min_order_vnd) {
      skippedIds.push(v.id);
    } else {
      const rawDiscount = (remaining * v.discount_value) / 100;
      const discount = Math.floor(rawDiscount / 1000) * 1000;

      if (discount <= 0) {
        skippedIds.push(v.id);
      } else {
        totalDiscount += discount;
        appliedIds.push(v.id);
      }
    }
  }

  return totalDiscount;
}

/**
 * Shared order calculator — unified pricing pipeline.
 * Computes all price fields from pre-resolved items + voucher configs.
 */
export function calcOrderTotals(input: CalcOrderInput): CalcOrderResult {
  const appliedVoucherIds: string[] = [];
  const skippedVoucherIds: string[] = [];

  // Step 1: Gross subtotal
  const subtotal_vnd = input.items.reduce(
    (sum, item) => sum + item.line_total,
    0
  );

  // Step 2: Item-level discounts (PRODUCT + ADDON)
  const {
    discount: items_discount_vnd,
    surplus: order_surplus_vnd,
    itemResults,
  } = calcItemDiscounts(input.items, appliedVoucherIds, skippedVoucherIds);

  // Step 3: Discountable subtotal
  const discountable_subtotal_vnd = Math.max(subtotal_vnd - items_discount_vnd, 0);

  // Step 4: Order-level DISCOUNT vouchers
  const total_voucher_discount_vnd = calcDiscountTotals(
    input.discountVouchers,
    discountable_subtotal_vnd,
    appliedVoucherIds,
    skippedVoucherIds
  );

  // Step 5: total_vnd (before shipping)
  const total_vnd = Math.max(discountable_subtotal_vnd - total_voucher_discount_vnd, 0);

  // Step 6: FREESHIP
  const shipping_fee_vnd = input.shipping_fee_vnd;
  let freeship_discount_vnd = 0;

  if (input.freeshipVoucher) {
    const fv = input.freeshipVoucher;

    // Check min_order on total_vnd (after all discounts, before ship)
    const meetsMinOrder =
      fv.min_order_vnd === null || total_vnd >= fv.min_order_vnd;

    // Must have actual benefit
    const hasBenefit =
      shipping_fee_vnd > 0 && fv.covered_delivery_fee_vnd > 0;

    if (meetsMinOrder && hasBenefit) {
      freeship_discount_vnd = Math.min(
        fv.covered_delivery_fee_vnd,
        shipping_fee_vnd
      );
      appliedVoucherIds.push(fv.id);
    } else {
      skippedVoucherIds.push(fv.id);
    }
  }

  // Step 7: Grand total
  const grand_total_vnd = total_vnd + shipping_fee_vnd - freeship_discount_vnd;

  return {
    subtotal_vnd,
    items_discount_vnd,
    discountable_subtotal_vnd,
    total_voucher_discount_vnd,
    total_vnd,
    shipping_fee_vnd,
    freeship_discount_vnd,
    grand_total_vnd,
    order_surplus_vnd,
    itemResults,
    appliedVoucherIds,
    skippedVoucherIds,
  };
}
