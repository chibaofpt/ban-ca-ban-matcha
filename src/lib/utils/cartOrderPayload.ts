import type { ProjectedCartLine } from "@/src/lib/types/cart";

export interface SerializedCartOrderItem {
  client_line_id?: string;
  menu_item_id: string;
  quantity: number;
  size: "SMALL" | "MEDIUM" | "LARGE" | null;
  sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL" | "EXTRA";
  ice_option: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";
  coldwhisk: boolean;
  note?: string;
  addon_option_ids: string[];
  product_voucher_id?: string;
  item_voucher_id?: string;
  addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
  selected_powder_id?: string;
  selected_base_liquid_id?: string;
  client_price_vnd: number;
}

/** Serialize current-catalog projections into the unchanged customer/staff order item contract. */
export function serializeCartOrderItems(
  lines: readonly ProjectedCartLine[],
  options: { includeClientLineId?: boolean } = {},
): SerializedCartOrderItem[] {
  return lines.map((line) => {
    const config = line.configuration;
    const isDrink = config.size !== null;
    return {
      ...(options.includeClientLineId ? { client_line_id: line.cartId } : {}),
      menu_item_id: line.menuItemId,
      quantity: line.quantity,
      size: config.size,
      sweetness: isDrink ? config.sweetness : "FULL",
      ice_option: isDrink ? config.iceOption : "NORMAL",
      coldwhisk: isDrink ? config.coldwhisk : false,
      ...(config.note ? { note: config.note } : {}),
      addon_option_ids: isDrink ? config.addonOptionIds : [],
      ...(line.lineVoucher?.kind === "ITEM"
        ? { item_voucher_id: line.lineVoucher.token }
        : line.lineVoucher ? { product_voucher_id: line.lineVoucher.token } : {}),
      ...(line.addonVouchers.length > 0 ? {
        addon_voucher_ids: line.addonVouchers.map((voucher) => ({
          voucher_id: voucher.token,
          addon_option_id: voucher.addonOptionId,
        })),
      } : {}),
      ...(isDrink && config.powderId ? { selected_powder_id: config.powderId } : {}),
      ...(isDrink && config.baseLiquidId ? { selected_base_liquid_id: config.baseLiquidId } : {}),
      client_price_vnd: Math.max(0, line.grossUnitPriceVnd - line.personalVoucherDiscountVnd),
    };
  });
}
