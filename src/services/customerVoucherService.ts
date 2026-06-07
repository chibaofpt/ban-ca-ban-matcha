/**
 * customerVoucherService — Customer-facing voucher API calls.
 *
 * Covers:
 *  - listActiveVoucherPackages  → GET /api/voucher-packages
 *  - listMyVouchers             → GET /api/profile/vouchers
 *  - exchangeVoucher            → POST /api/profile/vouchers/exchange
 */

import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
}

export interface MyVoucher {
  id: string;
  qr_token: string;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP";
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "M" | "L" | "XL" | null;
  /** For PRODUCT vouchers — the powder used in the snapshot config. */
  matcha_powder_id: string | null;
  /** For PRODUCT vouchers — the milk type used in the snapshot config. */
  milk_type_id: string | null;
  /** For PRODUCT vouchers — addon option ids included in the snapshot config. */
  included_addon_option_ids: string[];
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  /** Max shipping fee covered. FREESHIP vouchers only. */
  covered_delivery_fee_vnd: number | null;
  /** Minimum order total required. FREESHIP vouchers only. NULL = no minimum. */
  min_order_vnd: number | null;
  status: "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";
  used_channel: "ONLINE" | "OFFLINE" | null;
  expires_at: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  created_at: string;
  package: { name: string; description: string | null; points_cost: number };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
  /** Staff/admin who redeemed this voucher offline. null = user redeemed themselves online. */
  staff: { name: string; role: "STAFF" | "ADMIN" | "CUSTOMER" } | null;
}

export interface ExchangedVoucher {
  id: string;
  qr_token: string;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP";
  status: "ACTIVE";
  expires_at: string | null;
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Fetches the list of active VoucherPackages available for redemption.
 * Calls GET /api/voucher-packages (public route, no auth required).
 */
export async function listActiveVoucherPackages(): Promise<VoucherPackage[]> {
  const res = await apiClient.get<ApiResponse<VoucherPackage[]>>("/api/voucher-packages");
  return res.data.data;
}

/**
 * Fetches all ACTIVE vouchers belonging to the current user.
 * Calls GET /api/profile/vouchers (requires CUSTOMER auth).
 */
export async function listMyVouchers(): Promise<MyVoucher[]> {
  const res = await apiClient.get<ApiResponse<MyVoucher[]>>("/api/profile/vouchers");
  return res.data.data;
}

/**
 * Spends points to redeem a VoucherPackage and receive a new Voucher instance.
 * Calls POST /api/profile/vouchers/exchange (requires CUSTOMER auth).
 *
 * Throws with response.data.code on 422/404 errors:
 *  - INSUFFICIENT_POINTS
 *  - VOUCHER_LIMIT_REACHED
 *  - VOUCHER_SOLD_OUT
 *  - NOT_FOUND
 */
export async function exchangeVoucher(packageId: string): Promise<ExchangedVoucher> {
  const res = await apiClient.post<ApiResponse<ExchangedVoucher>>(
    "/api/profile/vouchers/exchange",
    { package_id: packageId }
  );
  return res.data.data;
}
