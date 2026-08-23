import type { BundleVoucherRule } from "@/src/services/customerVoucherService";
import type { MenuItem, MilkTypeOption, SweetnessLevel, Size } from "@/src/lib/types/menu";
import type { IceOption, CartItem } from "@/src/lib/types/cart";

export type BundleProductScope = BundleVoucherRule["qualifier_products"][number];

export interface BundleItemConfig {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  size: Size | null;
  powderId: string | null;
  milkTypeId: string | null;
  baseLiquidId?: string | null; // Tests might check this
  sweetness: SweetnessLevel;
  iceOption: IceOption;
  coldwhisk: boolean;
  selectedOptionIds: string[];
  quantityMap: Record<string, number>;
  unitPriceVnd: number;
  addonsCost: number;
  addonPrices: Record<string, number>;
  quantityAddonOptions: { option_id: string; quantity: number }[];
}

export interface CanApplyDiscountResult {
  canApply: boolean;
  deficitVnd: number;
}

export interface CanApplyFreeshipResult {
  canApply: boolean;
  reason?: string;
  deficitVnd: number;
}

/**
 * Return the first available grouped BUNDLE product; callers resolve current prices separately.
 */
export function findCheapestScope(scopes: BundleProductScope[]): BundleProductScope | null {
  if (!scopes || scopes.length === 0) return null;
  const availableScopes = scopes.filter((scope) => scope.menu_item.is_available);
  if (availableScopes.length === 0) return null;
  return availableScopes[0] ?? null;
}

/**
 * Check if a DISCOUNT voucher can be applied given current cart subtotal.
 * min_order_vnd === null means no minimum required.
 */
export function canApplyDiscount(
  subtotalVndOrVoucher: number | { min_order_vnd: number | null },
  minOrderVndOrSubtotal: number | null
): CanApplyDiscountResult {
  let subtotalVnd: number;
  let minOrder: number | null;
  
  if (typeof subtotalVndOrVoucher === 'number') {
    subtotalVnd = subtotalVndOrVoucher;
    minOrder = minOrderVndOrSubtotal;
  } else {
    minOrder = subtotalVndOrVoucher.min_order_vnd;
    subtotalVnd = minOrderVndOrSubtotal as number;
  }

  if (minOrder === null || minOrder === 0) {
    return { canApply: true, deficitVnd: 0 };
  }
  if (subtotalVnd >= minOrder) {
    return { canApply: true, deficitVnd: 0 };
  }
  return { canApply: false, deficitVnd: minOrder - subtotalVnd };
}

/**
 * Check if a FREESHIP voucher can be applied.
 * Requires: DELIVERY order type + shippingFee > 0 + totalVnd >= min_order_vnd.
 */
export function canApplyFreeship(
  orderType: "PICKUP" | "DELIVERY" | string,
  totalVnd: number,
  min_order_vnd: number | null,
  shippingFee: number | null
): CanApplyFreeshipResult {
  if (orderType !== "DELIVERY") {
    return { canApply: false, reason: "Voucher này chỉ áp dụng cho đơn giao hàng.", deficitVnd: 0 };
  }
  if (shippingFee === null || shippingFee === 0) {
    return { canApply: false, reason: "Đơn hàng chưa có phí vận chuyển hoặc đang được miễn phí.", deficitVnd: 0 };
  }
  const minOrder = min_order_vnd;
  if (minOrder !== null && totalVnd < minOrder) {
    return { canApply: false, reason: `Thiếu ${minOrder - totalVnd}đ để sử dụng.`, deficitVnd: minOrder - totalVnd };
  }
  return { canApply: true, deficitVnd: 0 };
}

/**
 * Build a BundleItemConfig from a qualifier/reward scope.
 * Resolves the stored default configuration; the caller supplies the current gross server-style estimate.
 */
export function buildBundleItemConfig(
  scope: BundleProductScope,
  menuItem: MenuItem,
  milkTypes: MilkTypeOption[],
  unitPriceVnd = menuItem.unit_price_vnd ?? 0,
): BundleItemConfig {
  let milkTypeId: string | null = null;
  if (scope.default_base_liquid_id && milkTypes.find(m => m.id === scope.default_base_liquid_id)) {
    milkTypeId = scope.default_base_liquid_id;
  } else if (menuItem.default_base_liquid_id) {
    milkTypeId = menuItem.default_base_liquid_id;
  } else {
    const defaultMilk = milkTypes.find(m => m.is_default);
    if (defaultMilk) {
      milkTypeId = defaultMilk.id;
    }
  }

  return {
    menuItemId: scope.menu_item_id,
    name: menuItem.name || "",
    imageUrl: menuItem.image_url || null,
    size: menuItem.category === "extras" ? null : scope.allowed_sizes[0] ?? null,
    powderId: scope.default_powder_id,
    milkTypeId: milkTypeId,
    baseLiquidId: milkTypeId,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    selectedOptionIds: [],
    quantityMap: {},
    unitPriceVnd,
    addonsCost: 0,
    addonPrices: {},
    quantityAddonOptions: [],
  };
}

const SWEETNESS_LABEL: Record<string, string> = {
  NONE: "Không đường",
  QUARTER: "Ít đường",
  HALF: "Nửa đường",
  THREE_QUARTER: "Vừa đường",
  FULL: "Nguyên đường",
  EXTRA: "Thêm đường",
};

const ICE_LABEL: Record<string, string> = {
  NORMAL: "Đá bình thường",
  LESS_ICE: "Ít đá",
  NO_ICE: "Không đá",
  SEPARATE_ICE: "Đá riêng",
};

const SIZE_SHORT: Record<string, string> = { SMALL: "S", MEDIUM: "M", LARGE: "L" };

/**
 * Returns a compact display string for non-default config fields on a bundle slot card.
 * Only shows size, sweetness (if not QUARTER), ice (if not NORMAL), and coldwhisk (if true).
 * Format: "M · Ít đường · Coldwhisk"
 */
export function formatBundleSlotConfig(config: BundleItemConfig): string {
  const parts: string[] = [];
  if (config.size) parts.push(SIZE_SHORT[config.size] ?? config.size);
  if (config.sweetness && config.sweetness !== "QUARTER") {
    parts.push(SWEETNESS_LABEL[config.sweetness] ?? config.sweetness);
  }
  if (config.iceOption && config.iceOption !== "NORMAL") {
    parts.push(ICE_LABEL[config.iceOption] ?? config.iceOption);
  }
  if (config.coldwhisk) parts.push("Coldwhisk");
  return parts.join(" · ");
}

/**
 * Converts a CartItem returned by ProductModal's onConfirm into a BundleItemConfig
 * for the pending slot state of BundleVoucherSetupSheet.
 */
export function cartItemToBundleConfig(
  cartItem: CartItem,
  scope: BundleProductScope,
): BundleItemConfig {
  return {
    menuItemId: cartItem.menuItemId,
    name: cartItem.name,
    imageUrl: cartItem.imageUrl,
    size: cartItem.size,
    powderId: cartItem.selectedPowderId ?? scope.default_powder_id ?? null,
    milkTypeId: cartItem.selectedBaseLiquidId ?? cartItem.selectedMilkTypeId ?? null,
    baseLiquidId: cartItem.selectedBaseLiquidId ?? cartItem.selectedMilkTypeId ?? null,
    sweetness: cartItem.sweetness,
    iceOption: cartItem.iceOption,
    coldwhisk: cartItem.coldwhisk,
    selectedOptionIds: cartItem.selectedOptionIds,
    quantityMap: cartItem.quantityMap,
    unitPriceVnd: cartItem.clientPriceVnd,
    addonsCost: cartItem.addonsPrice,
    addonPrices: cartItem.addonPrices,
    quantityAddonOptions: cartItem.quantityAddonOptions,
  };
}
