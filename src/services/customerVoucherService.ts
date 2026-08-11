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
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE";
  acquisition_mode?: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  points_cost: number;
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
  user_redeemed_count?: number;
  menuItem?: { name: string; is_available: boolean } | null;
  addonOption?: { label: string } | null;
}

export interface MyVoucher {
  qr_token: string;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE";
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "SMALL" | "MEDIUM" | "LARGE" | null;
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
  created_at: string;
  package: {
    name: string;
    description: string | null;
    points_cost: number;
    acquisition_mode?: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
    promotion?: {
      title: string;
      starts_at: string;
      ends_at: string;
      bundleRule: {
        buy_quantity: number;
        reward_quantity: number;
        reward_kind: "PRODUCT" | "ADDON";
        reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
        benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
        max_applications_order: number;
        max_reward_units_order: number | null;
        productScopes: Array<{ role: "QUALIFIER" | "REWARD"; menu_item_id: string }>;
        addonRewards: Array<{ addon_option_id: string }>;
      } | null;
    } | null;
  };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
  /** Staff/admin who redeemed this voucher offline. null = user redeemed themselves online. */
  staff: { name: string; role: "STAFF" | "ADMIN" | "CUSTOMER" } | null;
}

export interface ExchangedVoucher {
  qr_token: string;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP" | "BUNDLE";
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
 * Fetches vouchers in every lifecycle status belonging to the current user.
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

/** Claim a FREE_CLAIM package without points; repeated calls are idempotent. */
export async function claimFreeVoucher(
  packageId: string,
): Promise<{ qr_token?: string; already_granted?: true }> {
  const res = await apiClient.post<
    ApiResponse<{ qr_token?: string; already_granted?: true }>
  >("/api/profile/vouchers/claim", { package_id: packageId });
  return res.data.data;
}
