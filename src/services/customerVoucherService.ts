/**
 * customerVoucherService — Customer-facing voucher API calls.
 *
 * Covers:
 *  - listActiveVoucherPackages  → GET /api/voucher-packages
 *  - listMyVouchers             → GET /api/profile/vouchers
 *  - exchangeVoucher            → POST /api/profile/vouchers/exchange
 */

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
import type {
  AcquiredVoucher,
  ExchangedVoucher,
  MyVoucher,
  MyVoucherPage,
  RefundedVoucher,
  VoucherPackage,
} from "@/contracts/voucher";

export type {
  AcquiredVoucher,
  BundleVoucherProduct,
  BundleVoucherRule,
  ExchangedVoucher,
  MyVoucher,
  MyVoucherPage,
  RefundedVoucher,
  VoucherAvailability,
  VoucherAvailabilityStatus,
  VoucherEligibleAddonOption,
  VoucherEligibleMenuItem,
  VoucherIssuedVia,
  VoucherPackage,
  VoucherPackageAcquisitionMode,
} from "@/contracts/voucher";

// ── API Calls ─────────────────────────────────────────────────────────────────

/**
 * Fetches the list of active VoucherPackages available for redemption.
 * Calls GET /api/voucher-packages (public route, no auth required).
 */
export async function listActiveVoucherPackages(): Promise<VoucherPackage[]> {
  const res = await apiClient.get<ApiResponse<VoucherPackage[]>>("/api/voucher-packages");
  return res.data.data;
}

const WALLET_URL = "/api/profile/vouchers";

/** Read one bounded wallet page, reconciling lifecycle only before the first page. */
export async function listMyVoucherPage(
  options: { statuses?: MyVoucher["status"][]; cursor?: string } = {},
): Promise<MyVoucherPage> {
  if (!options.cursor) await apiClient.post(`${WALLET_URL}/sync`);
  const query = new URLSearchParams({ limit: "50" });
  if (options.statuses?.length) query.set("status", options.statuses.join(","));
  if (options.cursor) query.set("cursor", options.cursor);
  const res = await apiClient.get<MyVoucherPage>(`${WALLET_URL}?${query}`);
  return res.data;
}

/** Read every ACTIVE/RESERVED voucher without loading redeemed or expired history. */
export async function listMyVouchers(): Promise<MyVoucher[]> {
  const vouchers = new Map<string, MyVoucher>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await listMyVoucherPage({ statuses: ["ACTIVE", "RESERVED"], cursor });
    for (const voucher of page.data) vouchers.set(voucher.qr_token, voucher);
    if (!page.meta?.has_more) break;
    const next = page.meta.next_cursor;
    if (!next || cursors.has(next)) throw new Error("Không thể tải đầy đủ ví voucher. Vui lòng thử lại.");
    cursors.add(next);
    cursor = next;
  } while (cursor);
  return [...vouchers.values()];
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
): Promise<AcquiredVoucher> {
  const res = await apiClient.post<ApiResponse<AcquiredVoucher>>(
    "/api/profile/vouchers/claim",
    { package_id: packageId },
  );
  return res.data.data;
}

/** Refund an unusable points-exchange voucher after explicit user confirmation. */
export async function refundVoucher(qrToken: string): Promise<RefundedVoucher> {
  const res = await apiClient.post<ApiResponse<RefundedVoucher>>(
    "/api/profile/vouchers/refund",
    { qr_token: qrToken },
  );
  return res.data.data;
}
