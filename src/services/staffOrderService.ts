import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { SweetnessLevel } from "@/src/lib/types/menu";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreateStaffOrderPayload {
  /** Optional — omit entirely for anonymous (walk-in, no loyalty) orders. */
  phone_number?: string;
  customer_name?: string;
  items: {
    menu_item_id: string;
    quantity: number;
    /** Required — all items have SMALL/MEDIUM/LARGE. */
    size: "SMALL" | "MEDIUM" | "LARGE";
    sweetness: SweetnessLevel;
    /** Defaults to NORMAL on server if omitted; explicit here for correctness. */
    ice_option: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";
    coldwhisk: boolean;
    note?: string;
    addon_option_ids: { option_id: string; quantity: number }[];
    product_voucher_id?: string;
    /** ADDON vouchers per item — each targets a specific addon_option_id. */
    addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
    /** Fusion only — server validates against item's allowed powder list. */
    selected_powder_id?: string;
    /** Latte only — server defaults to is_default milk if omitted. */
    selected_milk_type_id?: string;
    /**
     * Client-computed final unit price. Required.
     * Server recomputes and rejects with PRICE_CHANGED on mismatch.
     */
    client_price_vnd: number;
  }[];
  /** DISCOUNT voucher IDs (multiple allowed, max 1 PERCENT). Omit for anonymous orders. */
  discount_voucher_ids?: string[];
  /**
   * Customer QR token (‘qr_token’ from users table). Required for STAFF when any voucher is used.
   * Admin auto-bypasses QR verification — omit for admin orders.
   */
  customer_qr_token?: string;
}

/** A single customer result returned by the search endpoint. */
export interface CustomerSearchResult {
  id: string;
  name: string;
  phone_number: string;
  points_balance: number;
}

export type QrScanResult =
  | {
      type: "user";
      data: {
        id: string;
        name: string;
        phone_number: string;
        points_balance: number;
      };
    }
  | {
      type: "voucher";
      data: {
        id: string;
        voucher_type: "DISCOUNT" | "PRODUCT";
        discount_type: "PERCENT" | "FIXED" | null;
        discount_value: number | null;
        menu_item_id: string | null;
        covered_price_vnd: number | null;
        status: "ACTIVE" | "REDEEMED" | "EXPIRED";
        expires_at: string | null;
      };
    };

// ── Service ─────────────────────────────────────────────────────────────────

const URLS = {
  users: "/api/staff/users",
  orders: "/api/staff/orders",
  scan: "/api/staff/scan",
  scanFallback: "/api/staff/scan-fallback",
  redeemVoucher: (qrToken: string) => `/api/staff/vouchers/${qrToken}/redeem`,
} as const;

/**
 * Search customers by name or last digits of phone number.
 * Requires at least 2 characters. Returns up to 10 matches.
 */
export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const res = await apiClient.get<ApiResponse<{ items: CustomerSearchResult[] }>>(URLS.users, {
    params: { q: query },
  });
  return res.data.data.items;
}

/**
 * Create a counter order. Ghost user creation is handled server-side.
 * Omit phone_number for anonymous (walk-in) orders.
 */
export async function createStaffOrder(payload: CreateStaffOrderPayload): Promise<void> {
  await apiClient.post(URLS.orders, payload);
}

/**
 * Resolve a QR token — returns user info or voucher info.
 */
export async function scanQrToken(token: string): Promise<QrScanResult> {
  const res = await apiClient.get<ApiResponse<QrScanResult>>(URLS.scan, {
    params: { token },
  });
  return res.data.data;
}

/**
 * Mark a voucher as REDEEMED offline via its QR token.
 */
export async function redeemVoucher(qrToken: string): Promise<void> {
  await apiClient.patch(URLS.redeemVoucher(qrToken));
}

/**
 * Fallback to resolve a QR token manually when scanning fails.
 * Only supports looking up users right now.
 */
export async function scanFallback(phone_number: string, code: string): Promise<QrScanResult> {
  const res = await apiClient.post<ApiResponse<QrScanResult>>(URLS.scanFallback, {
    phone_number,
    code,
  });
  return res.data.data;
}
