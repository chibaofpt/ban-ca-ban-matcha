import type { Size } from "@/contracts/menu";

/** Validated PRODUCT voucher data for a single order item — pre-fetched outside the transaction. */
export interface ProductVoucherInfo {
  /** The menu_item_id the voucher is locked to. Server rejects if item doesn't match. */
  menu_item_id: string;
  /** Normalized PRODUCT_DISCOUNT snapshot targets; absent uses legacy anchor. */
  eligible_menu_item_ids?: string[];
  /** Fixed PRODUCT credit, capped at the server-computed drink price and never applied to addons. */
  covered_price_vnd: number;
  voucher_type?: "PRODUCT" | "PRODUCT_DISCOUNT" | "ITEM";
  product_discount_mode?: "FIXED_AMOUNT" | "PAY_AS_SIZE" | null;
  eligible_sizes?: Size[];
  reference_size?: Size | null;
  discount_value?: number | null;
  /** Optional Base Liquid restriction for PRODUCT_DISCOUNT; null keeps legacy all-liquid behavior. */
  milk_type_id?: string | null;
}

/** Match a product voucher against normalized snapshot targets with legacy fallback. */
export function productVoucherTargetsMenuItem(voucher: ProductVoucherInfo, menuItemId: string): boolean {
  const targetIds = voucher.eligible_menu_item_ids?.length
    ? voucher.eligible_menu_item_ids
    : [voucher.menu_item_id];
  return targetIds.includes(menuItemId);
}

/** Match a product discount against both its menu target and optional Base Liquid restriction. */
export function productVoucherTargetsConfiguration(
  voucher: ProductVoucherInfo,
  menuItemId: string,
  selectedMilkTypeId: string | null,
): boolean {
  if (!productVoucherTargetsMenuItem(voucher, menuItemId)) return false;
  return voucher.voucher_type !== "PRODUCT_DISCOUNT" ||
    voucher.milk_type_id === null ||
    voucher.milk_type_id === undefined ||
    voucher.milk_type_id === selectedMilkTypeId;
}
