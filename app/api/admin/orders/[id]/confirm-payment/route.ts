import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { after } from "next/server";
import { sendPushToRoles } from "@/lib/push";

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
        freeship_voucher_id: true,
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
          await restoreVouchersOnCancel(tx, id);
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

        // ── Redeem all Vouchers ──

        // 1. DISCOUNT vouchers
        const discountLinks = await tx.orderDiscountVoucher.findMany({
          where: { order_id: id },
          select: { voucher_id: true },
        });
        for (const link of discountLinks) {
          await tx.voucher.update({
            where: { id: link.voucher_id },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // 2. PRODUCT & ADDON vouchers
        const voucherItems = await tx.orderItem.findMany({
          where: { 
            order_id: id,
            product_voucher_id: { not: null },
          },
          select: { product_voucher_id: true },
        });

        const addonVouchers = await tx.orderItemAddonVoucher.findMany({
          where: { orderItem: { order_id: id } },
          select: { voucher_id: true }
        });

        const uniqueItemVoucherIds = [
          ...new Set([
            ...voucherItems.map((i) => i.product_voucher_id).filter((id): id is string => id !== null),
            ...addonVouchers.map((i) => i.voucher_id)
          ]),
        ];

        for (const vId of uniqueItemVoucherIds) {
          await tx.voucher.update({
            where: { id: vId },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // 3. FREESHIP voucher
        if (order.freeship_voucher_id) {
          await tx.voucher.update({
            where: { id: order.freeship_voucher_id },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // 4. Award deferred surplus points
        if (result.user_id) {
          const itemsWithSurplus = await tx.orderItem.findMany({
            where: { order_id: id, surplus_points: { gt: 0 } },
            select: { surplus_points: true, product_voucher_id: true }
          });
          for (const item of itemsWithSurplus) {
            await tx.user.update({
              where: { id: result.user_id },
              data: { points_balance: { increment: item.surplus_points! } }
            });
            await tx.pointsLog.create({
              data: {
                user_id: result.user_id,
                delta: item.surplus_points!,
                reason: "voucher_surplus",
                voucher_id: item.product_voucher_id,
                order_id: id,
                performed_by: session.id,
              }
            });
          }
        }

        return result;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    // After response returns, trigger push notification
    after(() => {
      console.log(`[AFTER JOB] Starting background push notification for confirmed order: ${updatedOrder.order_code}`);
      sendPushToRoles(
        ["STAFF", "ADMIN"],
        {
          title: "✅ Đã xác nhận thanh toán",
          body: `Đơn ${updatedOrder.order_code} đã được thanh toán. Chuẩn bị món thôi!`,
          url: "/staff/orders",
        },
        session.id // Không push lại cho người vừa duyệt
      )
        .then(() => console.log(`[AFTER JOB] Successfully completed push task for confirmed order: ${updatedOrder.order_code}`))
        .catch((err) => console.error("[AFTER JOB] Failed to send push:", err));
    });

    return NextResponse.json({ data: updatedOrder });
  } catch (err) {
    console.error("[PATCH /api/admin/orders/[id]/confirm-payment]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
