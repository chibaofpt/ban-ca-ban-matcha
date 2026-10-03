import { OrderValidationError } from "@/lib/orders/orderProcessingErrors";
import type {
  OrderItemInput,
  PriceConflict,
  ProcessedOrderItem,
} from "@/lib/orders/orderProcessingTypes";
import type { ProductVoucherInfo } from "@/lib/orders/orderVoucherTargets";

interface ExtrasMenuItem {
  name: string;
  unit_price_vnd: number | null;
}

/** Resolve one extras line without invoking drink recipe pricing. */
export function resolveExtrasOrderItem(
  item: OrderItemInput,
  menuItem: ExtrasMenuItem,
  itemVoucherId: string | undefined,
  productVoucherMap: Map<string, ProductVoucherInfo> | undefined,
  priceConflicts: PriceConflict[],
): ProcessedOrderItem {
  if (item.size != null || item.selected_powder_id || item.selected_milk_type_id || item.selected_base_liquid_id || item.addon_option_ids.length > 0) {
    throw new OrderValidationError("VALIDATION_ERROR", "Món Add-on chỉ hỗ trợ số lượng và ghi chú.");
  }
  if (menuItem.unit_price_vnd === null || menuItem.unit_price_vnd < 1000 || menuItem.unit_price_vnd % 1000 !== 0) {
    throw new OrderValidationError("BUSINESS_RULE_VIOLATION", `Giá món Add-on không hợp lệ: ${menuItem.name}`);
  }
  const serverUnitPrice = menuItem.unit_price_vnd;
  const itemVoucher = itemVoucherId ? productVoucherMap?.get(itemVoucherId) : undefined;
  if (itemVoucher && (itemVoucher.voucher_type !== "ITEM" || itemVoucher.menu_item_id !== item.menu_item_id)) {
    throw new OrderValidationError("VALIDATION_ERROR", "ITEM voucher không áp dụng cho món Add-on này.");
  }
  const itemDiscount = itemVoucher ? serverUnitPrice : 0;
  const expectedClientPrice = serverUnitPrice - itemDiscount;
  if (item.client_price_vnd !== expectedClientPrice) {
    priceConflicts.push({
      menu_item_id: item.menu_item_id,
      name: menuItem.name,
      size: null,
      client_price_vnd: item.client_price_vnd,
      server_price_vnd: expectedClientPrice,
    });
  }
  return {
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    size: null,
    sweetness: item.sweetness ?? "FULL",
    ice_option: item.ice_option ?? "NORMAL",
    coldwhisk: item.coldwhisk ?? false,
    note: item.note ?? null,
    product_voucher_id: item.product_voucher_id ?? null,
    item_voucher_id: item.item_voucher_id ?? item.product_voucher_id ?? null,
    addon_voucher_ids: [],
    selected_powder_id: null,
    selected_milk_type_id: null,
    base_liquid_ml: null,
    unit_price_vnd: serverUnitPrice,
    addons_price_vnd: 0,
    product_voucher_discount_vnd: itemDiscount,
    product_voucher_type: null,
    total_discount_vnd: itemDiscount,
    line_total: serverUnitPrice * item.quantity,
    resolvedAddons: [],
  };
}
