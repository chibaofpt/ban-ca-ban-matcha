import type { Category, Size } from "@/contracts/menu";
import type {
  OwnedVoucherStatus,
  ProductDiscountMode,
  VoucherDiscountType,
  VoucherEligibleAddonOption,
  VoucherEligibleMenuItem,
  VoucherIssuedVia,
  VoucherType,
  VoucherUsedChannel,
} from "@/contracts/voucher";

export type { VoucherIssuedVia } from "@/contracts/voucher";
export type {
  VoucherEligibleAddonOption,
  VoucherEligibleMenuItem,
} from "@/contracts/voucher";

export type VoucherPackageVisibility = "PUBLIC" | "PRIVATE";
export type AdminVoucherAcquisitionMode =
  | "NONE"
  | "POINTS_EXCHANGE"
  | "FREE_CLAIM"
  | "AUTO_GRANT";

export interface VoucherPackageStats {
  issued_count: number;
  quota_issued_count: number;
  active_count: number;
  reserved_count: number;
  redeemed_count: number;
  expired_count: number;
  refunded_count: number;
  remaining_quantity: number | null;
  self_acquisition_count?: number;
  self_acquisition_used_count?: number;
}

export interface VoucherBundleProductScope {
  menu_item_id: string;
  default_powder_id?: string | null;
  default_base_liquid_id?: string | null;
  allowed_sizes: Size[];
  menu_item?: { name: string; category: Category; is_available: boolean };
}

export interface VoucherBundleRule {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  max_applications_per_order: number;
  max_reward_units_per_order?: number | null;
  qualifier_products: VoucherBundleProductScope[];
  reward_products: VoucherBundleProductScope[];
  reward_addon_option_ids: string[];
}

/** Admin projection returned by voucher-package management endpoints. */
export interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: VoucherType;
  visibility: VoucherPackageVisibility;
  acquisition_mode: AdminVoucherAcquisitionMode;
  points_cost: number;
  ends_at: string | null;
  discount_type: VoucherDiscountType | null;
  discount_value: number | null;
  max_discount_vnd: number | null;
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
  max_per_user: number;
  created_at: string;
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
  bundleRule?: VoucherBundleRule | null;
  _count?: { vouchers: number };
  stats?: VoucherPackageStats;
}

export type VoucherOwnerStatus = "ALL" | OwnedVoucherStatus;

export interface VoucherOwnerInstance {
  qr_token: string;
  status: OwnedVoucherStatus;
  effective_status: OwnedVoucherStatus;
  issued_via: VoucherIssuedVia;
  created_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  used_channel: VoucherUsedChannel | null;
}

export interface VoucherPackageOwner {
  qr_token: string;
  name: string;
  insta_name: string | null;
  phone_number: string;
  vouchers: VoucherOwnerInstance[];
}

export interface VoucherOwnerPage {
  users: VoucherPackageOwner[];
  next_cursor: string | null;
}

export type VoucherRecipientStatus = "ALL" | "CURRENT" | "USED";

export interface AdminVoucherRecipientVoucher {
  qr_token: string;
  issued_via: VoucherIssuedVia;
  created_at: string;
  effective_status: OwnedVoucherStatus;
  expires_at: string | null;
  redeemed_at: string | null;
}

export type AdminVoucherGrantWarning =
  | "ACTIVE_OR_RESERVED_VOUCHER_EXISTS"
  | "SELF_ACQUISITION_LIMIT_REACHED";

export interface AdminVoucherRecipientSummary {
  self_acquisition_count: number;
  self_acquisition_limit: number | null;
  self_acquisition_remaining: number | null;
  current_count: number;
  used_count: number;
  global_remaining: number | null;
  grant_eligible: boolean;
  warning_reasons: AdminVoucherGrantWarning[];
  expiry_preview: string | null;
}

export interface AdminVoucherRecipientPage {
  user: { qr_token: string; name: string; phone_number: string };
  vouchers: AdminVoucherRecipientVoucher[];
  meta: { has_more: boolean; next_cursor: string | null };
  summary: AdminVoucherRecipientSummary;
}

interface VoucherPackageCommonInput {
  name: string;
  description?: string;
  visibility?: VoucherPackageVisibility;
  acquisition_mode: AdminVoucherAcquisitionMode;
  points_cost: number;
  ends_at?: string | null;
  expires_after_days?: number | null;
  quantity?: number | null;
  max_per_user?: number;
}

export type CreateVoucherPackageInput = VoucherPackageCommonInput & (
  | {
      voucher_type: "DISCOUNT";
      discount_type: VoucherDiscountType;
      discount_value: number;
      min_order_vnd?: number | null;
      max_discount_vnd?: number | null;
    }
  | {
      voucher_type: "ITEM";
      menu_item_id: string;
      eligible_menu_item_ids?: string[];
    }
  | {
      voucher_type: "PRODUCT";
      menu_item_id: string;
      size: Size;
      matcha_powder_id?: string | null;
      milk_type_id?: string | null;
      included_addon_option_ids?: string[];
      product_targets?: Array<{
        menu_item_id: string;
        size: Size;
        matcha_powder_id?: string | null;
        milk_type_id?: string | null;
      }>;
    }
  | {
      voucher_type: "ADDON";
      addon_option_id: string;
      eligible_addon_option_ids?: string[];
    }
  | {
      voucher_type: "PRODUCT_DISCOUNT";
      menu_item_id: string;
      eligible_menu_item_ids?: string[];
      product_discount_mode: ProductDiscountMode;
      eligible_sizes: Size[];
      discount_value?: number;
      reference_size?: Size;
    }
  | {
      voucher_type: "FREESHIP";
      covered_delivery_fee_vnd: number;
      min_order_vnd?: number | null;
    }
  | {
      voucher_type: "BUNDLE";
      min_order_vnd?: number | null;
      bundle_rule: VoucherBundleRule;
    }
);

export interface UpdateVoucherPackageInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface GrantVoucherInput {
  user_qr_token: string;
  request_id: string;
  acknowledge_additional_gift?: boolean;
}

export interface GrantedVoucher {
  qr_token: string;
  voucher_type: VoucherType;
  status: OwnedVoucherStatus;
  effective_status: OwnedVoucherStatus;
  expires_at: string | null;
  already_granted: boolean;
}

export interface DeactivateVoucherPackageResult {
  id: string;
  is_active: false;
}
