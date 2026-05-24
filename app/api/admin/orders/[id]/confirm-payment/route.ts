import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

export const dynamic = "force-dynamic";

/** PATCH /api/admin/orders/[id]/confirm-payment — Admin confirms customer bank transfer. */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;

    // Read order outside transaction (pgBouncer compatible)
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        order_type: true,
        auto_cancel_at: true,
        voucher_id: true,
        addon_voucher_id: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Only PICKUP/DELIVERY orders can have payment confirmed
    if (order.order_type === "COUNTER") {
      return NextResponse.json(
        { error: "Counter orders do not require payment confirmation", code: "INVALID_ORDER_TYPE" },
        { status: 422 }
      );
    }

    if (order.status !== "PENDING") {
      return NextResponse.json(
        { error: `Order status is ${order.status} — can only confirm PENDING orders`, code: "INVALID_STATUS" },
        { status: 422 }
      );
    }

    // Check if the order has already expired (auto-cancel window)
    if (order.auto_cancel_at && order.auto_cancel_at <= new Date()) {
      // Auto-cancel it inline and reject the confirmation attempt
      await prisma.$transaction(
        async (tx) => {
          await tx.order.update({ where: { id }, data: { status: "CANCELLED" } });
          await restoreVouchersOnCancel(tx, id, order.voucher_id, order.addon_voucher_id);
        },
        { maxWait: 5000, timeout: 10000 }
      );
      return NextResponse.json(
        { error: "Order has expired and was automatically cancelled", code: "ORDER_EXPIRED" },
        { status: 422 }
      );
    }

    // Confirm payment — transition to ADMIN_CONFIRMED + redeem voucher
    const updatedOrder = await prisma.$transaction(
      async (tx) => {
        const result = await tx.order.update({
          where: { id },
          data: {
            status: "ADMIN_CONFIRMED",
            payment_confirmed_at: new Date(),
            payment_confirmed_by: session.id,
          },
          include: {
            user: { select: { name: true, phone_number: true } },
          },
        });

        // DISCOUNT voucher was RESERVED — now fully REDEEMED
        if (order.voucher_id) {
          await tx.voucher.update({
            where: { id: order.voucher_id },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // ADDON voucher was RESERVED — now fully REDEEMED
        if (order.addon_voucher_id) {
          await tx.voucher.update({
            where: { id: order.addon_voucher_id },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // PRODUCT vouchers were RESERVED — transition to REDEEMED
        const productVoucherItems = await tx.orderItem.findMany({
          where: { order_id: id, product_voucher_id: { not: null } },
          select: { product_voucher_id: true },
        });
        const uniquePvIds = [
          ...new Set(
            productVoucherItems
              .map((i) => i.product_voucher_id)
              .filter((pvId): pvId is string => pvId !== null)
          ),
        ];
        for (const pvId of uniquePvIds) {
          await tx.voucher.update({
            where: { id: pvId },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        return result;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    return NextResponse.json({ data: updatedOrder });
  } catch (err) {
    console.error("[PATCH /api/admin/orders/[id]/confirm-payment]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
