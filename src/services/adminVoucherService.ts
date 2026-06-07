import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";

export interface VoucherPackage {
  id: string;
  name: string;
  description: string | null;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP";
  points_cost: number;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "M" | "L" | "XL" | null;
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
}

export type CreateVoucherPackageInput =
  | {
      voucher_type: "DISCOUNT";
      name: string;
      description?: string;
      points_cost: number;
      discount_type: "PERCENT" | "FIXED";
      discount_value: number;
      expires_after_days?: number | null;
      quantity?: number | null;
      max_per_user?: number | null;
    }
  | {
      voucher_type: "PRODUCT";
      name: string;
      description?: string;
      points_cost: number;
      menu_item_id: string;
      size: "M" | "L" | "XL";
      matcha_powder_id?: string | null;
      milk_type_id?: string | null;
      included_addon_option_ids?: string[];
      expires_after_days?: number | null;
      quantity?: number | null;
      max_per_user?: number | null;
    }
  | {
      voucher_type: "ADDON";
      name: string;
      description?: string;
      points_cost: number;
      addon_option_id: string;
      expires_after_days?: number | null;
      quantity?: number | null;
      max_per_user?: number | null;
    }
  | {
      voucher_type: "FREESHIP";
      name: string;
      description?: string;
      points_cost: number;
      covered_delivery_fee_vnd: number;
      min_order_vnd?: number | null;
      expires_after_days?: number | null;
      quantity?: number | null;
      max_per_user?: number | null;
    };


export type UpdateVoucherPackageInput = {
  name?: string;
  description?: string | null;
  points_cost?: number;
  is_active?: boolean;
  expires_after_days?: number | null;
  quantity?: number | null;
  max_per_user?: number | null;
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
