/**
 * Lazy voucher expiry — sync ACTIVE vouchers past expires_at to EXPIRED.
 * Called before list, apply, scan flows.
 * Does NOT touch RESERVED vouchers.
 */

import { prisma } from "@/lib/prisma";

/**
 * Marks ACTIVE vouchers with expires_at <= now as EXPIRED.
 * Returns the count of vouchers transitioned.
 */
export async function lazyExpireVouchers(userId: string): Promise<number> {
  const result = await prisma.voucher.updateMany({
    where: {
      user_id: userId,
      status: "ACTIVE",
      expires_at: { lte: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
