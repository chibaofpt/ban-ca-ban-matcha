/**
 * Shared voucher redeem helper — batch updateMany with count guard.
 * Used by both confirm-payment and staff order update ADMIN_CONFIRMED.
 */

import type { Prisma } from "@prisma/client";

/** Error thrown when voucher count mismatch occurs during redeem. */
export class VoucherRedeemError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "VoucherRedeemError";
  }
}

/** Prisma transaction client subset needed for voucher operations. */
interface TxVoucher {
  voucher: Pick<Prisma.TransactionClient["voucher"], "updateMany">;
}

/**
 * Redeems all vouchers by ID in a single batch updateMany.
 * Throws VoucherRedeemError if count !== expected.
 * No-op if voucherIds is empty.
 */
export async function redeemOrderVouchers(
  tx: TxVoucher,
  voucherIds: string[],
  channel: "ONLINE" | "OFFLINE",
  performedBy: string,
  expectedStatus: "ACTIVE" | "RESERVED" = "RESERVED"
): Promise<void> {
  if (voucherIds.length === 0) return;

  const result = await tx.voucher.updateMany({
    where: {
      id: { in: voucherIds },
      status: expectedStatus,
    },
    data: {
      status: "REDEEMED",
      used_channel: channel,
      redeemed_at: new Date(),
      redeemed_by: performedBy,
    },
  });

  if (result.count !== voucherIds.length) {
    throw new VoucherRedeemError(
      "VOUCHER_MISMATCH",
      `Expected ${voucherIds.length} vouchers to redeem, but only ${result.count} were updated`
    );
  }
}
