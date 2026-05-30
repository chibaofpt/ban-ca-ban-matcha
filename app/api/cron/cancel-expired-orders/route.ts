import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cancel-expired-orders
 * Vercel Cron — runs every 5 minutes (see vercel.json).
 * Cancels PENDING customer orders that have passed their auto_cancel_at deadline.
 * Restores any RESERVED vouchers to ACTIVE.
 *
 * Security: Validates CRON_SECRET in Authorization header.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Find all expired PENDING orders (PICKUP/DELIVERY only — COUNTER has no auto_cancel_at)
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: "PENDING",
        auto_cancel_at: { lte: now },
      },
      select: {
        id: true,
      },
    });

    if (expiredOrders.length === 0) {
      return NextResponse.json({ data: { cancelled_count: 0 } });
    }

    // Cancel each order atomically — individual transactions for voucher consistency
    let cancelledCount = 0;
    await Promise.all(
      expiredOrders.map(async (order) => {
        try {
          await prisma.$transaction(
            async (tx) => {
              await tx.order.update({
                where: { id: order.id },
                data: { status: "CANCELLED" },
              });
              await restoreVouchersOnCancel(tx, order.id);
            },
            { maxWait: 5000, timeout: 10000 }
          );
          cancelledCount++;
        } catch (err) {
          // Log but do not throw — one failed cancel should not block others
          console.error(`[cron] Failed to cancel order ${order.id}:`, err);
        }
      })
    );

    console.log(`[cron/cancel-expired-orders] Cancelled ${cancelledCount}/${expiredOrders.length} orders`);
    return NextResponse.json({ data: { cancelled_count: cancelledCount } });
  } catch (err) {
    console.error("[GET /api/cron/cancel-expired-orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
