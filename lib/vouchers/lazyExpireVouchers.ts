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
export async function lazyExpireVouchers(
  userId: string,
  now = new Date(),
  db: Pick<typeof prisma, "voucher"> = prisma,
): Promise<number> {
  const result = await db.voucher.updateMany({
    where: {
      user_id: userId,
      status: "ACTIVE",
      expires_at: { lte: now },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}
