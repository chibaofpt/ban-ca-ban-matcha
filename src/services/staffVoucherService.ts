/**
 * staffVoucherService — Fetches a customer's vouchers on behalf of staff/admin.
 *
 * Covers:
 *  - fetchCustomerVouchers → GET /api/staff/users/[id]/vouchers
 */

import { apiClient } from "@/src/lib/api/client";
import { isAxiosError } from "axios";
import { ApiServiceError } from "@/src/lib/api/serviceError";
import type { ApiError } from "@/src/lib/types/api";
import type { ApiResponse } from "@/src/lib/types/api";
import type { ExchangedVoucher, MyVoucher, VoucherPackage } from "@/contracts/voucher";

// Re-export for convenience
export type { ExchangedVoucher, MyVoucher } from "@/contracts/voucher";

const URL = { catalog: "/api/voucher-packages" } as const;

/** Fetch acquisition packages on behalf of an ADMIN-selected customer. */
export async function listCustomerVoucherPackages(customerQrToken: string): Promise<VoucherPackage[]> {
  try {
    const res = await apiClient.get<ApiResponse<VoucherPackage[]>>(URL.catalog, { params: { customerQrToken } });
    return res.data.data;
  } catch (error: unknown) {
    if (!isAxiosError<ApiError>(error) || !error.response?.data?.error) throw error;
    const payload = error.response.data;
    throw new ApiServiceError(payload.error, error.response.status, payload.code ?? "INTERNAL_ERROR", payload.details);
  }
}

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Fetches ACTIVE and RESERVED vouchers belonging to a given customer.
 * Calls GET /api/staff/users/[id]/vouchers (requires STAFF or ADMIN auth).
 */
export async function fetchCustomerVouchers(userQrToken: string): Promise<MyVoucher[]> {
  const res = await apiClient.get<ApiResponse<MyVoucher[]>>(
    `/api/staff/users/${userQrToken}/vouchers`
  );
  return res.data.data;
}

/**
 * Spends a customer's points to redeem a VoucherPackage on their behalf.
 * Calls POST /api/staff/users/[id]/vouchers/exchange (requires ADMIN auth).
 */
export async function exchangeCustomerVoucher(userQrToken: string, packageId: string): Promise<ExchangedVoucher> {
  const res = await apiClient.post<ApiResponse<ExchangedVoucher>>(
    `/api/staff/users/${userQrToken}/vouchers/exchange`,
    { package_id: packageId }
  );
  return res.data.data;
}
