import type { Prisma } from "@prisma/client";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { captureServerException } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const BATCH_SIZE = 25;
const CONCURRENCY = 5;

/** Summary returned after processing one bounded auto-cancel batch. */
export interface CancelExpiredOrdersResult {
  selected: number;
  cancelled: number;
  skipped: number;
  failed: number;
}

type CancelOutcome = "cancelled" | "skipped" | "failed";

async function cancelOneExpiredOrder(orderId: string): Promise<CancelOutcome> {
  try {
    return await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const claim = await tx.order.updateMany({
          where: { id: orderId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        if (claim.count !== 1) return "skipped";
        await restoreVouchersOnCancel(tx, orderId);
        return "cancelled";
      },
      { maxWait: 5000, timeout: 10000 },
    );
  } catch (error) {
    captureServerException(error, { operation: "cancel_expired_order" });
    return "failed";
  }
}

/** Cancel at most 25 expired PENDING orders with bounded concurrency. */
export async function runCancelExpiredOrders(
  now: Date = new Date(),
): Promise<CancelExpiredOrdersResult> {
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      auto_cancel_at: { lte: now },
    },
    select: { id: true },
    orderBy: { auto_cancel_at: "asc" },
    take: BATCH_SIZE,
  });

  const outcomes: CancelOutcome[] = [];
  for (let index = 0; index < expiredOrders.length; index += CONCURRENCY) {
    const group = expiredOrders.slice(index, index + CONCURRENCY);
    outcomes.push(...await Promise.all(group.map((order) => cancelOneExpiredOrder(order.id))));
  }

  return {
    selected: expiredOrders.length,
    cancelled: outcomes.filter((outcome) => outcome === "cancelled").length,
    skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}
