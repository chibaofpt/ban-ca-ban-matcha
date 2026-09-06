import type { Prisma } from "@prisma/client";
import { CancellationPointsError, recoverCancellationPoints } from "@/lib/cancellationVoucherRecovery";

type CancellationPointsTx = Pick<Prisma.TransactionClient, "pointsLog" | "user" | "voucher">;

export interface CancellationAdjustment {
  revoked_voucher_count: number;
  refunded_points: number;
  reversed_points: number;
}

/** Fully reverse outstanding completion awards, recovering spent points from purchased vouchers. */
export async function reverseCancellationPoints(
  tx: CancellationPointsTx,
  input: {
    orderId: string;
    performedBy: string | null;
    excludedVoucherIds: string[];
  },
): Promise<CancellationAdjustment> {
  const select = {
    id: true, user_id: true, delta: true, reason: true, voucher_id: true,
    reversalLogs: { select: {
      delta: true, user_id: true, order_id: true, reason: true, reversed_log_id: true,
      reversalLogs: { select: { id: true } },
    } },
  } as const;
  const completionAwards = await tx.pointsLog.findMany({
    where: {
      order_id: input.orderId,
      reason: "order_complete",
      delta: { gt: 0 },
    },
    select,
  });
  const surplusAwards = await tx.pointsLog.findMany({
    where: {
      order_id: input.orderId,
      reason: "voucher_surplus",
      delta: { gt: 0 },
    },
    select,
  });
  const awards = [...completionAwards, ...surplusAwards].map((award) => {
    const reversalReason = award.reason === "voucher_surplus"
      ? "voucher_surplus_reversed" : "order_complete_reversed";
    const reversals = award.reversalLogs ?? [];
    if (reversals.some((reversal) =>
      reversal.delta >= 0 || reversal.user_id !== award.user_id ||
      reversal.order_id !== input.orderId || reversal.reason !== reversalReason ||
      reversal.reversed_log_id !== award.id || reversal.reversalLogs.length > 0
    )) throw new CancellationPointsError("Invalid order point reversal audit");
    const delta = award.delta + reversals.reduce((sum, reversal) => sum + reversal.delta, 0);
    if (delta < 0) throw new CancellationPointsError("Order points were over-reversed");
    return { ...award, delta };
  }).filter((award) => award.delta > 0);
  if (awards.length === 0) {
    return { revoked_voucher_count: 0, refunded_points: 0, reversed_points: 0 };
  }
  const userId = awards[0].user_id;
  if (awards.some((award) => award.user_id !== userId)) throw new CancellationPointsError("Invalid order point audit");
  const reversedPoints = awards.reduce((sum, award) => sum + award.delta, 0);
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { points_balance: true },
  });
  const recovery = await recoverCancellationPoints(tx, {
    userId,
    currentBalance: user.points_balance,
    requiredPoints: reversedPoints,
    excludedVoucherIds: input.excludedVoucherIds,
    performedBy: input.performedBy,
    orderId: input.orderId,
  });
  const debited = await tx.user.updateMany({
    where: { id: userId, points_balance: { gte: reversedPoints } },
    data: { points_balance: { decrement: reversedPoints } },
  });
  if (debited.count !== 1) throw new Error("Point balance changed concurrently");
  for (const award of awards) {
    await tx.pointsLog.create({
      data: {
        user_id: userId,
        delta: -award.delta,
        reason:
          award.reason === "voucher_surplus"
            ? "voucher_surplus_reversed"
            : "order_complete_reversed",
        voucher_id: award.voucher_id,
        order_id: input.orderId,
        performed_by: input.performedBy,
        reversed_log_id: award.id,
      },
    });
  }
  return {
    revoked_voucher_count: recovery.revokedVoucherCount,
    refunded_points: recovery.refundedPoints,
    reversed_points: reversedPoints,
  };
}
