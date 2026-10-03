import type { Role } from "./auth";
import type { Category, Size } from "./menu";

export type VoucherType =
  | "ITEM"
  | "DISCOUNT"
  | "PRODUCT"
  | "PRODUCT_DISCOUNT"
  | "ADDON"
  | "FREESHIP"
  | "BUNDLE";

export type VoucherAcquisitionMode = "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
export type VoucherPackageAcquisitionMode = VoucherAcquisitionMode | "NONE" | "ADMIN" | "WELCOME_GIFT" | "GACHA_REWARD";
export type VoucherIssuedVia = Exclude<VoucherPackageAcquisitionMode, "NONE">;
export type VoucherDiscountType = "PERCENT" | "FIXED";
export type ProductDiscountMode = "FIXED_AMOUNT" | "PAY_AS_SIZE";
export type OwnedVoucherStatus = "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
export type VoucherUsedChannel = "ONLINE" | "OFFLINE";

export interface VoucherEligibleMenuItem {
  menu_item_id: string;
  name: string;
  category: Category;
  is_available: boolean;
  is_seasonal: boolean;
  size?: Size | null;
  matcha_powder_id?: string | null;
  milk_type_id?: string | null;
  covered_price_vnd?: number | null;
}

export interface VoucherEligibleAddonOption {
  addon_option_id: string;
  label: string;
  price_vnd: number;
  is_active: boolean;
  is_dynamic_gram: boolean;
}

export interface BundleVoucherProduct {
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  allowed_sizes: Size[];
  /** Dynamic checkout baseline for FIXED_CONFIG / ALLOWED_SCOPE rewards only. */
  baseline_prices_vnd?: Partial<Record<Size, number>>;
  /** Dynamic fixed price for extras rewards only. */
  baseline_price_vnd?: number;
  menu_item: { name: string; category: Category; is_available: boolean };
}

export interface BundleVoucherRule {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  max_applications_per_order: number;
  max_reward_units_per_order: number | null;
  qualifier_products: BundleVoucherProduct[];
  reward_products: BundleVoucherProduct[];
  reward_addon_option_ids: string[];
}

export type VoucherAvailabilityStatus =
  | "USABLE"
  | "TARGET_UNAVAILABLE"
  | "NO_ACTIVE_QUALIFIER"
  | "NO_ACTIVE_REWARD"
  | "NO_ACTIVE_CONFIGURATION";

export interface VoucherAvailability {
  status: VoucherAvailabilityStatus;
  can_apply: boolean;
  can_refund: boolean;
  refund_points: number;
}

export interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: VoucherType;
  acquisition_mode: VoucherAcquisitionMode;
  points_cost: number;
  ends_at?: string | null;
  discount_type: VoucherDiscountType | null;
  discount_value: number | null;
  product_discount_mode?: ProductDiscountMode | null;
  menu_item_id: string | null;
  eligible_menu_items?: VoucherEligibleMenuItem[];
  eligible_addon_options?: VoucherEligibleAddonOption[];
  eligible_sizes?: Size[];
  reference_size?: Size | null;
  size: Size | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  covered_delivery_fee_vnd: number | null;
  min_order_vnd: number | null;
  is_active: boolean;
  expires_after_days: number | null;
  quantity: number | null;
  remaining_quantity?: number | null;
  max_per_user: number;
  created_at: string;
  user_redeemed_count?: number;
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
  bundleRule?: BundleVoucherRule | null;
}

export interface MyVoucher {
  /** Optional catalog package reference; older wallet responses may omit it. */
  package_id?: string;
  qr_token: string;
  voucher_type: VoucherType;
  issued_via?: VoucherIssuedVia;
  discount_type: VoucherDiscountType | null;
  discount_value: number | null;
  product_discount_mode?: ProductDiscountMode | null;
  menu_item_id: string | null;
  eligible_menu_items?: VoucherEligibleMenuItem[];
  eligible_addon_options?: VoucherEligibleAddonOption[];
  eligible_sizes?: Size[];
  reference_size?: Size | null;
  size: Size | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  covered_delivery_fee_vnd: number | null;
  min_order_vnd: number | null;
  max_discount_vnd: number | null;
  status: OwnedVoucherStatus;
  used_channel: VoucherUsedChannel | null;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
  package: {
    name: string;
    description: string | null;
    points_cost: number;
    acquisition_mode?: VoucherPackageAcquisitionMode;
    ends_at?: string | null;
    bundleRule?: BundleVoucherRule | null;
  };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
  staff: { name: string; role: Role } | null;
  availability: VoucherAvailability;
}

export interface MyVoucherPage {
  data: MyVoucher[];
  /** Older, unpaginated responses may omit metadata. */
  meta?: { limit: number; has_more: boolean; next_cursor: string | null };
}

export interface ExchangedVoucher {
  qr_token: string;
  voucher_type: VoucherType;
  status: "ACTIVE";
  expires_at: string | null;
}

export interface AcquiredVoucher extends ExchangedVoucher {
  already_granted: boolean;
}

export interface RefundedVoucher {
  qr_token: string;
  status: "REFUNDED";
  points_refunded: number;
}
