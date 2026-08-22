import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";

export interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: "ITEM" | "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE";
  acquisition_mode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  points_cost: number;
  ends_at: string | null;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "SMALL" | "MEDIUM" | "LARGE" | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  /** Max shipping fee covered. FREESHIP vouchers only. */
  covered_delivery_fee_vnd: number | null;
  /** Minimum order total required. FREESHIP vouchers only. NULL = no minimum. */
  min_order_vnd: number | null;
  is_active: boolean;
  expires_after_days: number | null;
  quantity: number | null;
  max_per_user: number;
  created_at: string;
  menuItem?: {
    name: string;
    is_available: boolean;
  } | null;
  addonOption?: {
    label: string;
  } | null;
  bundleRule?: VoucherBundleRule | null;
}

export interface VoucherBundleProductScope {
  menu_item_id: string;
  default_powder_id?: string | null;
  default_base_liquid_id?: string | null;
  allowed_sizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
  menu_item?: { name: string; category: "latte" | "fusion" | "extras"; is_available: boolean };
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

interface VoucherPackageCommonInput {
  name: string;
  description?: string;
  acquisition_mode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  points_cost: number;
  ends_at?: string | null;
  expires_after_days?: number | null;
  quantity?: number | null;
  max_per_user?: number | null;
}

export type CreateVoucherPackageInput = VoucherPackageCommonInput & (
  | {
      voucher_type: "DISCOUNT";
      discount_type: "PERCENT" | "FIXED";
      discount_value: number;
      min_order_vnd?: number | null;
    }
  | {
      voucher_type: "ITEM";
      menu_item_id: string;
    }
  | {
      voucher_type: "PRODUCT";
      menu_item_id: string;
      size: "SMALL" | "MEDIUM" | "LARGE";
      matcha_powder_id?: string | null;
      milk_type_id?: string | null;
      included_addon_option_ids?: string[];
    }
  | {
      voucher_type: "ADDON";
      addon_option_id: string;
    }
  | {
      voucher_type: "FREESHIP";
      covered_delivery_fee_vnd: number;
      min_order_vnd?: number | null;
    }
  | {
      voucher_type: "BUNDLE";
      min_order_vnd?: number | null;
      bundle_rule: {
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
      };
    }
);


export type UpdateVoucherPackageInput = {
  name?: string;
  description?: string | null;
  is_active?: boolean;
};

const URL = {
  list: "/api/admin/voucher-packages",
  byId: (id: string) => `/api/admin/voucher-packages/${id}`,
} as const;

/** List all voucher packages (active and inactive) — ADMIN only. */
export async function listVoucherPackages(): Promise<VoucherPackage[]> {
  const res = await apiClient.get<ApiResponse<VoucherPackage[]>>(URL.list);
  return res.data.data;
}

/** Create a new voucher package — ADMIN only. */
export async function createVoucherPackage(data: CreateVoucherPackageInput): Promise<VoucherPackage> {
  const res = await apiClient.post<ApiResponse<VoucherPackage>>(URL.list, data);
  return res.data.data;
}

/** Update editable fields of a voucher package — ADMIN only. */
export async function updateVoucherPackage(
  id: string,
  data: UpdateVoucherPackageInput
): Promise<VoucherPackage> {
  const res = await apiClient.put<ApiResponse<VoucherPackage>>(URL.byId(id), data);
  return res.data.data;
}

/** Deactivate (soft delete) a voucher package — ADMIN only. */
export async function deleteVoucherPackage(id: string): Promise<VoucherPackage> {
  const res = await apiClient.delete<ApiResponse<VoucherPackage>>(URL.byId(id));
  return res.data.data;
}
