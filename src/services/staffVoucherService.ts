/**
 * staffVoucherService — Fetches a customer's vouchers on behalf of staff/admin.
 *
 * Covers:
 *  - fetchCustomerVouchers → GET /api/staff/users/[id]/vouchers
 */

import { apiClient } from "@/src/lib/api/client";
import type { ApiResponse } from "@/src/lib/types/api";
import type { MyVoucher } from "./customerVoucherService";

// Re-export for convenience
export type { MyVoucher } from "./customerVoucherService";

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Fetches all ACTIVE vouchers belonging to a given customer.
 * Calls GET /api/staff/users/[id]/vouchers (requires STAFF or ADMIN auth).
 */
export async function fetchCustomerVouchers(userId: string): Promise<MyVoucher[]> {
  const res = await apiClient.get<ApiResponse<MyVoucher[]>>(
    `/api/staff/users/${userId}/vouchers`
  );
  return res.data.data;
}
