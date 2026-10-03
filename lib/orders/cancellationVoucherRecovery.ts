import type { Prisma } from "@prisma/client";

type RecoveryTx = Pick<Prisma.TransactionClient, "voucher" | "user" | "pointsLog">;

export interface CancellationVoucherRecoveryResult {
  revokedVoucherCount: number;
  refundedPoints: number;
}

/** Stable business error raised when cancellation cannot fully recover its point debt. */
export class CancellationPointsError extends Error {
  readonly code = "BUSINESS_RULE_VIOLATION";
  readonly reason = "INSUFFICIENT_REVERSIBLE_POINTS";
}

/** Refund newest eligible purchased vouchers until the user's cancellation debt is coverable. */
export async function recoverCancellationPoints(
  tx: RecoveryTx,
  input: {
    userId: string;
    currentBalance: number;
    requiredPoints: number;
    excludedVoucherIds: string[];
    performedBy: string | null;
    orderId: string;
  },
): Promise<CancellationVoucherRecoveryResult> {
  let available = input.currentBalance;
  let refundedPoints = 0;
  let revokedVoucherCount = 0;
  if (available >= input.requiredPoints) return { revokedVoucherCount, refundedPoints };

  const now = new Date();
  const candidates = await tx.voucher.findMany({
    where: {
      user_id: input.userId,
      issued_via: "POINTS_EXCHANGE",
      status: "ACTIVE",
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      ...(input.excludedVoucherIds.length > 0
        ? { id: { notIn: input.excludedVoucherIds } }
        : {}),
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      pointsLogs: {
        where: { reason: { in: ["voucher_purchase", "voucher_refund"] } },
        select: {
          id: true, delta: true, reason: true, user_id: true, voucher_id: true,
          reversalLogs: { select: { id: true } },
        },
      },
    },
  });

  for (const voucher of candidates) {
    if (available >= input.requiredPoints) break;
    if (
      voucher.pointsLogs.length !== 1 || voucher.pointsLogs[0].delta >= 0 ||
      voucher.pointsLogs[0].reason !== "voucher_purchase" ||
      voucher.pointsLogs[0].user_id !== input.userId ||
      voucher.pointsLogs[0].voucher_id !== voucher.id ||
      voucher.pointsLogs[0].reversalLogs.length > 0
    ) {
      throw new CancellationPointsError("Missing trustworthy voucher purchase audit");
    }
    const purchaseLog = voucher.pointsLogs[0];
    const refund = -purchaseLog.delta;
    const revoked = await tx.voucher.updateMany({
      where: {
        id: voucher.id,
        user_id: input.userId,
        issued_via: "POINTS_EXCHANGE",
        status: "ACTIVE",
        OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      },
      data: { status: "REFUNDED" },
    });
    if (revoked.count !== 1) throw new CancellationPointsError("Voucher changed concurrently");
    await tx.user.update({
      where: { id: input.userId },
      data: { points_balance: { increment: refund } },
    });
    await tx.pointsLog.create({
      data: {
        user_id: input.userId,
        delta: refund,
        reason: "voucher_refund",
        voucher_id: voucher.id,
        order_id: input.orderId,
        performed_by: input.performedBy,
        reversed_log_id: purchaseLog.id,
      },
    });
    available += refund;
    refundedPoints += refund;
    revokedVoucherCount += 1;
  }

  if (available < input.requiredPoints) {
    throw new CancellationPointsError("Insufficient reversible points");
  }
  return { revokedVoucherCount, refundedPoints };
}
