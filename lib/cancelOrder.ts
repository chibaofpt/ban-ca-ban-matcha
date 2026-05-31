/**
 * Shared cancel-order helper used by all cancel paths.
 * Restores ALL vouchers (DISCOUNT, ADDON, PRODUCT) to ACTIVE,
 * reverses any surplus points awarded at order creation,
 * and optionally reverses order_complete points for COMPLETED orders.
 * Must be called inside a prisma.$transaction().
 */

import type { PrismaClient } from "@prisma/client";

/** Structural type satisfied by both PrismaClient and the Prisma transaction client. */
type CancelTxClient = Pick<
  PrismaClient,
  "order" | "orderItem" | "voucher" | "user" | "pointsLog" | "orderDiscountVoucher" | "orderItemAddonVoucher"
>;

interface RestoreOptions {
  /** If true, also reverses order_complete points. Use when cancelling a COMPLETED order. */
  reverseCompletionPoints?: boolean;
  /** Admin user ID to record as performed_by on reversal log rows. */
  performedBy?: string;
}

/**
 * Safely decrements a user's points_balance, flooring at 0 to prevent negative balances.
 * Returns the actual amount decremented (may be less than requested if balance < delta).
 */
async function safeDecrementPoints(
  tx: CancelTxClient,
  userId: string,
  delta: number
): Promise<number> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { points_balance: true },
  });
  const current = user?.points_balance ?? 0;
  const actualDecrement = Math.min(delta, current); // floor at 0
  if (actualDecrement > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { points_balance: { decrement: actualDecrement } },
    });
  }
  return actualDecrement;
}

/**
 * Restores ALL vouchers tied to an order back to ACTIVE, reverses
 * any `voucher_surplus` points_log rows, and optionally reverses
 * `order_complete` points when cancelling a COMPLETED order.
 *
 * @param tx - Prisma transaction client (must be called inside $transaction)
 * @param orderId - The ID of the order being cancelled
 * @param options - Optional flags for reversing completion points
 */
export async function restoreVouchersOnCancel(
  tx: CancelTxClient,
  orderId: string,
  options?: RestoreOptions
): Promise<void> {
  // 1. Restore all DISCOUNT vouchers tied to this order
  const discountLinks = await tx.orderDiscountVoucher.findMany({
    where: { order_id: orderId },
    select: { voucher_id: true },
  });

  const uniqueDiscountIds = [...new Set(discountLinks.map((l) => l.voucher_id))];

  for (const dvId of uniqueDiscountIds) {
    const dv = await tx.voucher.findUnique({
      where: { id: dvId },
      select: { status: true },
    });
    if (dv && (dv.status === "RESERVED" || dv.status === "REDEEMED")) {
      await tx.voucher.update({
        where: { id: dvId },
        data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
      });
    }
  }

  // 2. Find all PRODUCT & ADDON vouchers on order items and restore each to ACTIVE
  const voucherItems = await tx.orderItem.findMany({
    where: {
      order_id: orderId,
      product_voucher_id: { not: null },
    },
    select: { product_voucher_id: true },
  });

  const addonVouchers = await tx.orderItemAddonVoucher.findMany({
    where: {
      orderItem: { order_id: orderId }
    },
    select: { voucher_id: true }
  });

  const uniqueItemVoucherIds = [
    ...new Set([
      ...voucherItems.map((i) => i.product_voucher_id).filter((id): id is string => id !== null),
      ...addonVouchers.map((i) => i.voucher_id)
    ]),
  ];

  for (const pvId of uniqueItemVoucherIds) {
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

  // 3. Reverse any voucher_surplus points_log rows created at order creation.
  //    Uses safe decrement to floor balance at 0 (prevents negative balance).
  const surplusLogs = await tx.pointsLog.findMany({
    where: { order_id: orderId, reason: "voucher_surplus" },
    select: { id: true, user_id: true, delta: true, voucher_id: true },
  });

  for (const log of surplusLogs) {
    if (log.delta <= 0) continue; // already a reversal row, skip

    const actualDecrement = await safeDecrementPoints(tx, log.user_id, log.delta);

    await tx.pointsLog.create({
      data: {
        user_id: log.user_id,
        delta: -actualDecrement,
        reason: "voucher_surplus_reversed",
        voucher_id: log.voucher_id,
        order_id: orderId,
        performed_by: options?.performedBy ?? null,
        reversed_log_id: log.id,
      },
    });
  }

  // 4. Reverse order_complete points — only when cancelling a COMPLETED order.
  //    Uses safe decrement to floor balance at 0 (prevents negative balance).
  if (options?.reverseCompletionPoints) {
    const completionLogs = await tx.pointsLog.findMany({
      where: { order_id: orderId, reason: "order_complete" },
      select: { id: true, user_id: true, delta: true },
    });

    for (const log of completionLogs) {
      if (log.delta <= 0) continue; // skip if already a reversal

      const actualDecrement = await safeDecrementPoints(tx, log.user_id, log.delta);

      await tx.pointsLog.create({
        data: {
          user_id: log.user_id,
          delta: -actualDecrement,
          reason: "order_complete_reversed",
          voucher_id: null,
          order_id: orderId,
          performed_by: options?.performedBy ?? null,
          reversed_log_id: log.id,
        },
      });
    }
  }
}
