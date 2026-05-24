/**
 * Shared cancel-order helper used by all 5 cancel paths.
 * Restores ALL vouchers (DISCOUNT, ADDON, PRODUCT) to ACTIVE,
 * and reverses any surplus points awarded at order creation.
 * Must be called inside a prisma.$transaction().
 */

import type { PrismaClient } from "@prisma/client";

/** Structural type satisfied by both PrismaClient and the Prisma transaction client. */
type CancelTxClient = Pick<
  PrismaClient,
  "order" | "orderItem" | "voucher" | "user" | "pointsLog"
>;

/**
 * Restores ALL vouchers tied to an order back to ACTIVE, and reverses
 * any `voucher_surplus` points_log rows created at order creation.
 *
 * @param tx - Prisma transaction client (must be called inside $transaction)
 * @param orderId - The ID of the order being cancelled
 * @param discountVoucherId - The order's `voucher_id` (DISCOUNT voucher), or null
 * @param addonVoucherId - The order's `addon_voucher_id` (ADDON voucher), or null
 */
export async function restoreVouchersOnCancel(
  tx: CancelTxClient,
  orderId: string,
  discountVoucherId: string | null,
  addonVoucherId: string | null
): Promise<void> {
  // 1. Restore DISCOUNT voucher → ACTIVE (if RESERVED or REDEEMED)
  if (discountVoucherId) {
    const dv = await tx.voucher.findUnique({
      where: { id: discountVoucherId },
      select: { status: true },
    });
    if (dv && (dv.status === "RESERVED" || dv.status === "REDEEMED")) {
      await tx.voucher.update({
        where: { id: discountVoucherId },
        data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
      });
    }
  }

  // 2. Restore ADDON voucher → ACTIVE (if RESERVED or REDEEMED)
  if (addonVoucherId) {
    const av = await tx.voucher.findUnique({
      where: { id: addonVoucherId },
      select: { status: true },
    });
    if (av && (av.status === "RESERVED" || av.status === "REDEEMED")) {
      await tx.voucher.update({
        where: { id: addonVoucherId },
        data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
      });
    }
  }

  // 3. Find all PRODUCT vouchers on order items and restore each to ACTIVE
  const productVoucherItems = await tx.orderItem.findMany({
    where: { order_id: orderId, product_voucher_id: { not: null } },
    select: { product_voucher_id: true },
  });

  const uniqueProductVoucherIds = [
    ...new Set(
      productVoucherItems
        .map((i) => i.product_voucher_id)
        .filter((id): id is string => id !== null)
    ),
  ];

  for (const pvId of uniqueProductVoucherIds) {
    const pv = await tx.voucher.findUnique({
      where: { id: pvId },
      select: { status: true },
    });
    if (pv && (pv.status === "RESERVED" || pv.status === "REDEEMED")) {
      await tx.voucher.update({
        where: { id: pvId },
        data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
      });
    }
  }

  // 4. Reverse any voucher_surplus points_log rows created at order creation.
  //    Inserts negative-delta rows (immutable log pattern).
  const surplusLogs = await tx.pointsLog.findMany({
    where: { order_id: orderId, reason: "voucher_surplus" },
    select: { id: true, user_id: true, delta: true, voucher_id: true },
  });

  for (const log of surplusLogs) {
    if (log.delta <= 0) continue; // already a reversal row, skip

    await tx.user.update({
      where: { id: log.user_id },
      data: { points_balance: { decrement: log.delta } },
    });

    await tx.pointsLog.create({
      data: {
        user_id: log.user_id,
        delta: -log.delta,
        reason: "voucher_surplus_reversed",
        voucher_id: log.voucher_id,
        order_id: orderId,
        performed_by: null,
        reversed_log_id: log.id,
      },
    });
  }
}
