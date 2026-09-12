import { apiClient } from "@/src/lib/api/client";
import { isAxiosError } from "axios";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import type { VoucherEligibleAddonOption } from "@/src/services/customerVoucherService";
import { ApiServiceError } from "@/src/services/orderService";

async function preserveApiError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isAxiosError<ApiError>(error) || !error.response?.data?.error) throw error;
    const payload = error.response?.data;
    throw new ApiServiceError(
      payload?.error ?? error.message,
      error.response?.status ?? 0,
      payload?.code ?? "INTERNAL_ERROR",
      payload?.details,
    );
  }
}

export interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: "ITEM" | "DISCOUNT" | "PRODUCT" | "PRODUCT_DISCOUNT" | "ADDON" | "FREESHIP" | "BUNDLE";
  visibility: "PUBLIC" | "PRIVATE";
  acquisition_mode: "NONE" | "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  points_cost: number;
  ends_at: string | null;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  product_discount_mode?: "FIXED_AMOUNT" | "PAY_AS_SIZE" | null;
  menu_item_id: string | null;
  eligible_menu_items?: VoucherEligibleMenuItem[];
  eligible_addon_options?: VoucherEligibleAddonOption[];
  eligible_sizes?: Array<"SMALL" | "MEDIUM" | "LARGE">;
  reference_size?: "SMALL" | "MEDIUM" | "LARGE" | null;
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
  _count?: { vouchers: number };
  stats?: VoucherPackageStats;
}

export interface VoucherPackageStats {
  issued_count: number; active_count: number; reserved_count: number; redeemed_count: number;
  expired_count: number; refunded_count: number; remaining_quantity: number | null;
  self_acquisition_count?: number;
  self_acquisition_used_count?: number;
}

export type VoucherOwnerStatus = "ALL" | "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
export type VoucherIssuedVia = "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT" | "ADMIN";
export interface VoucherOwnerInstance { qr_token: string; status: Exclude<VoucherOwnerStatus, "ALL">; effective_status: Exclude<VoucherOwnerStatus, "ALL">; issued_via: VoucherIssuedVia; created_at: string; expires_at: string | null; redeemed_at: string | null; used_channel: "ONLINE" | "OFFLINE" | null }
export interface VoucherPackageOwner { qr_token: string; name: string; insta_name: string | null; phone_number: string; vouchers: VoucherOwnerInstance[] }
export interface VoucherOwnerPage { users: VoucherPackageOwner[]; next_cursor: string | null }

export type VoucherRecipientStatus = "ALL" | "CURRENT" | "USED";
export interface AdminVoucherRecipientVoucher {
  qr_token: string;
  issued_via: VoucherIssuedVia;
  created_at: string;
  effective_status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
  expires_at: string | null;
  redeemed_at: string | null;
}
export interface AdminVoucherRecipientSummary {
  self_acquisition_count: number;
  self_acquisition_limit: number | null;
  self_acquisition_remaining: number | null;
  current_count: number;
  used_count: number;
  global_remaining: number | null;
  grant_eligible: boolean;
  warning_reasons: string[];
  expiry_preview: string | null;
}
export interface AdminVoucherRecipientPage {
  user: { qr_token: string; name: string; phone_number: string };
  vouchers: AdminVoucherRecipientVoucher[];
  meta: { has_more: boolean; next_cursor: string | null };
  summary: AdminVoucherRecipientSummary;
}

export interface VoucherBundleProductScope {
  menu_item_id: string;
  default_powder_id?: string | null;
  default_base_liquid_id?: string | null;
  allowed_sizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
  menu_item?: { name: string; category: "latte" | "fusion" | "extras"; is_available: boolean };
}

export interface VoucherEligibleMenuItem {
  menu_item_id: string;
  name: string;
  category: "latte" | "fusion" | "extras";
  is_available: boolean;
  is_seasonal: boolean;
  size?: "SMALL" | "MEDIUM" | "LARGE" | null;
  matcha_powder_id?: string | null;
  milk_type_id?: string | null;
  covered_price_vnd?: number | null;
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
  visibility?: "PUBLIC" | "PRIVATE";
  acquisition_mode: "NONE" | "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
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
      eligible_menu_item_ids?: string[];
    }
  | {
      voucher_type: "PRODUCT";
      menu_item_id: string;
      size: "SMALL" | "MEDIUM" | "LARGE";
      matcha_powder_id?: string | null;
      milk_type_id?: string | null;
      included_addon_option_ids?: string[];
      product_targets?: Array<{
        menu_item_id: string;
        size: "SMALL" | "MEDIUM" | "LARGE";
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
      eligible_menu_item_ids: string[];
      product_discount_mode: "FIXED_AMOUNT" | "PAY_AS_SIZE";
      eligible_sizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
      discount_value?: number;
      reference_size?: "SMALL" | "MEDIUM" | "LARGE";
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
  owners: (id: string) => `/api/admin/voucher-packages/${id}/owners`,
  recipients: (id: string, userQrToken: string) => `/api/admin/voucher-packages/${id}/recipients/${userQrToken}`,
  grants: (id: string) => `/api/admin/voucher-packages/${id}/grants`,
} as const;

/** List all voucher packages (active and inactive) — ADMIN only. */
export async function listVoucherPackages(): Promise<VoucherPackage[]> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<VoucherPackage[]>>(URL.list);
    return res.data.data;
  });
}

/** Searches owners of one package with effective status filtering. */
export async function searchVoucherPackageOwners(id: string, params: { q: string; status: VoucherOwnerStatus; cursor?: string }): Promise<VoucherOwnerPage> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<VoucherOwnerPage>>(URL.owners(id), { params });
    return res.data.data;
  });
}

/** Reads one customer's bounded voucher history for a package. */
export async function getVoucherPackageRecipientHistory(
  id: string,
  userQrToken: string,
  params: { status: VoucherRecipientStatus; cursor?: string },
): Promise<AdminVoucherRecipientPage> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<AdminVoucherRecipientPage>>(
      URL.recipients(id, userQrToken),
      { params },
    );
    return res.data.data;
  });
}

export interface GrantVoucherInput {
  user_qr_token: string;
  request_id: string;
  acknowledge_additional_gift?: boolean;
}

export interface GrantedVoucher {
  qr_token: string;
  voucher_type: VoucherPackage["voucher_type"];
  status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
  effective_status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
  expires_at: string | null;
  already_granted: boolean;
}

/** Gives exactly one voucher to a selected CUSTOMER through the audited admin route. */
export async function grantVoucherToCustomer(
  id: string,
  input: GrantVoucherInput,
): Promise<GrantedVoucher> {
  return preserveApiError(async () => {
    const res = await apiClient.post<ApiResponse<GrantedVoucher>>(URL.grants(id), input);
    return res.data.data;
  });
}

/** Create a new voucher package — ADMIN only. */
export async function createVoucherPackage(data: CreateVoucherPackageInput): Promise<VoucherPackage> {
  return preserveApiError(async () => {
    const res = await apiClient.post<ApiResponse<VoucherPackage>>(URL.list, data);
    return res.data.data;
  });
}

/** Update editable fields of a voucher package — ADMIN only. */
export async function updateVoucherPackage(
  id: string,
  data: UpdateVoucherPackageInput
): Promise<VoucherPackage> {
  return preserveApiError(async () => {
    const res = await apiClient.put<ApiResponse<VoucherPackage>>(URL.byId(id), data);
    return res.data.data;
  });
}

/** Deactivate (soft delete) a voucher package — ADMIN only. */
export async function deleteVoucherPackage(id: string): Promise<VoucherPackage> {
  return preserveApiError(async () => {
    const res = await apiClient.delete<ApiResponse<VoucherPackage>>(URL.byId(id));
    return res.data.data;
  });
}
