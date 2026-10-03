import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { CreateStaffOrderPayload, StaffOrderResult } from "@/contracts/order";
import type { CustomerSearchResult, QrScanResult } from "@/contracts/staff";
import { normalizeCustomerSearch } from "@/src/utils/display";

export type { CreateStaffOrderPayload, StaffOrderResult } from "@/contracts/order";
export type {
  CustomerSearchResult,
  QrScanResult,
  ScannedVoucherMenuTarget,
} from "@/contracts/staff";

// ── Types ───────────────────────────────────────────────────────────────────

// ── Service ─────────────────────────────────────────────────────────────────

const URLS = {
  users: "/api/staff/users",
  orders: "/api/staff/orders",
  orderById: (id: string) => `/api/staff/orders/${id}`,
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
    params: { q: normalizeCustomerSearch(query) },
  });
  return res.data.data.items;
}

/**
 * Create a counter order. Ghost user creation is handled server-side.
 * Omit phone_number for anonymous (walk-in) orders.
 */
export async function createStaffOrder(
  payload: CreateStaffOrderPayload,
): Promise<StaffOrderResult> {
  const response = await apiClient.post<ApiResponse<StaffOrderResult>>(URLS.orders, payload);
  return response.data.data;
}

/** Fetch one authorized staff order for pending-payment recovery. */
export async function getStaffOrder(orderId: string): Promise<StaffOrderResult> {
  const response = await apiClient.get<ApiResponse<StaffOrderResult>>(
    URLS.orderById(orderId),
  );
  return response.data.data;
}

/** Apply an existing order status transition and return the updated public order. */
export async function updateStaffOrderStatus(
  orderId: string,
  status: "COMPLETED" | "CANCELLED",
): Promise<StaffOrderResult> {
  const response = await apiClient.patch<ApiResponse<StaffOrderResult>>(
    URLS.orderById(orderId),
    { status },
  );
  return response.data.data;
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
