import type { Size, SweetnessLevel } from "@/contracts/menu";
import type { IceOption } from "@/contracts/order";

export interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  size?: Size | null;
  sweetness: SweetnessLevel;
  ice_option?: IceOption;
  coldwhisk?: boolean;
  note?: string;
  addon_option_ids: string[];
  product_voucher_id?: string;
  item_voucher_id?: string;
  addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
  selected_powder_id?: string;
  selected_milk_type_id?: string;
  selected_base_liquid_id?: string;
  client_price_vnd: number;
}

export interface ProcessedAddon {
  addon_option_id: string;
  quantity: number;
  /** Snapshot original price at order time. Extra matcha: gram_value × price_per_gram. Others: price_vnd. */
  unit_price_vnd: number;
  /** Present only for Extra Matcha options; ADDON vouchers cannot cover these options. */
  gram_value: number | null;
  /** Exact amount of discount applied by an addon voucher (0 if none) */
  discount_applied_vnd: number;
}

export interface ProcessedOrderItem {
  menu_item_id: string;
  quantity: number;
  size: Size | null;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  product_voucher_id: string | null;
  item_voucher_id: string | null;
  addon_voucher_ids: { voucher_id: string; addon_option_id: string }[];
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
  /** Immutable effective Base Liquid volume for historical consumption reports. */
  base_liquid_ml: number | null;
  /** Server-computed drink price BEFORE any voucher credit. (Original price) */
  unit_price_vnd: number;
  /** Server-computed addons price BEFORE any voucher credit. (Original price) */
  addons_price_vnd: number;
  /** Exact amount of discount applied by the product voucher */
  product_voucher_discount_vnd: number;
  product_voucher_type: "PRODUCT" | "PRODUCT_DISCOUNT" | null;
  /** Total discount for this line item (product_voucher_discount_vnd + sum of addon voucher discounts) */
  total_discount_vnd: number;
  /** line_total = (unit_price_vnd + addons_price_vnd) × quantity (Original line total before discounts) */
  line_total: number;
  resolvedAddons: ProcessedAddon[];
}

export interface PriceConflict {
  menu_item_id: string;
  name: string;
  size: Size | null;
  client_price_vnd: number;
  server_price_vnd: number;
}
