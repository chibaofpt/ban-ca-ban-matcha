import type { Category, MenuItem, Size, SweetnessLevel } from "./menu";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";

export type IceOption = "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";

export type CartLineConfiguration =
  | { size: null; note: string }
  | {
      size: Size;
      sweetness: SweetnessLevel;
      iceOption: IceOption;
      coldwhisk: boolean;
      note: string;
      powderId?: string;
      baseLiquidId?: string;
      addonOptionIds: string[];
    };

export interface CartLineVoucher {
  token: string;
  kind: "ITEM" | "PRODUCT" | "PRODUCT_DISCOUNT";
}

export interface CartAddonVoucher {
  token: string;
  addonOptionId: string;
}

/** Minimal source data persisted for one customer or staff cart line. */
export interface CartItem {
  cartId: string;
  menuItemId: string;
  quantity: number;
  configuration: CartLineConfiguration;
  lineVoucher?: CartLineVoucher;
  addonVouchers: CartAddonVoucher[];
}

export type BundleRuntimeStatus =
  | "REVALIDATING"
  | "READY"
  | "NEEDS_CONFIGURATION"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "VERIFY_FAILED"
  | "NO_BENEFIT";

/** Compatibility name for callers while runtime status is kept outside persistence. */
export type BundleApplicationStatus = BundleRuntimeStatus;

export type BundleCreatedRewardEffect =
  | { kind: "LINE"; client_line_id: string }
  | { kind: "ADDON"; client_line_id: string; addon_option_id: string; quantity: number };

/** Persisted allocation identity for one BUNDLE voucher. */
export interface CartBundleApplication {
  voucher_qr_token: string;
  owner_key: string;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
  created_reward_effects: BundleCreatedRewardEffect[];
}

export interface BundleCartDraftCommit {
  items: CartItem[];
  application: CartBundleApplication;
}

export interface CartTransitionState {
  items: CartItem[];
  selectedOrderVoucherTokens: string[];
  bundleApplications: CartBundleApplication[];
}

export interface ResolvedCartAddon {
  id: string;
  label: string;
  priceVnd: number;
  groupId: string;
  groupName: string;
  maxSelect: number;
  isExtraMatcha: boolean;
}

/** Current-catalog cart projection used for rendering and order serialization. */
export interface ProjectedCartLine extends CartItem {
  name: string;
  imageUrl: string | null;
  category: Category;
  menuItem?: MenuItem;
  resolvedAddons: ResolvedCartAddon[];
  drinkPriceVnd: number;
  addonsPriceVnd: number;
  grossUnitPriceVnd: number;
  personalVoucherDiscountVnd: number;
  bundleDiscountVnd: number;
  payableUnitVnd: number;
  lineTotalVnd: number;
  errors: string[];
  revalidating: boolean;
}

export interface CartProjectionTotals {
  subtotal_vnd: number;
  item_discount_vnd: number;
  discountable_subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  order_surplus_vnd: number;
}

export interface CartProjectionResult {
  lines: ProjectedCartLine[];
  totals: CartProjectionTotals;
  checkoutBlocked: boolean;
  revalidating: boolean;
  errors: string[];
  bundleRuntimeStatus: Record<string, BundleRuntimeStatus>;
  bundleErrorsByToken: Record<string, string>;
  appliedOrderVoucherTokens: string[];
}
