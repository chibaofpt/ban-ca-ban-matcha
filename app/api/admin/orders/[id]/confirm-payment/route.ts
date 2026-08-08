import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { redeemOrderVouchers, VoucherRedeemError } from "@/lib/redeemVouchers";
import { toPublicOrderDto } from "@/lib/orderPublicDto";
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
      const cancelled = await prisma.$transaction(
        async (tx) => {
          const claim = await tx.order.updateMany({
            where: { id, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          if (claim.count !== 1) return false;
          await restoreVouchersOnCancel(tx, id);
          return true;
        },
        { maxWait: 5000, timeout: 10000 }
      );
      if (!cancelled) {
        return NextResponse.json(
          { error: "Order status changed concurrently", code: "STATUS_CONFLICT" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Order has expired and was automatically cancelled", code: "ORDER_EXPIRED" },
        { status: 422 }
      );
    }

    // Confirm payment — transition to ADMIN_CONFIRMED + redeem vouchers
    const updatedOrder = await prisma.$transaction(
      async (tx) => {
        const confirmedAt = new Date();
        const claimed = await tx.order.updateMany({
          where: {
            id,
            status: "PENDING",
            OR: [{ auto_cancel_at: null }, { auto_cancel_at: { gt: confirmedAt } }],
          },
          data: {
            status: "ADMIN_CONFIRMED",
            payment_confirmed_at: confirmedAt,
            payment_confirmed_by: session.id,
          },
        });
        if (claimed.count !== 1) {
          throw Object.assign(new Error("Order status changed concurrently"), {
            code: "STATUS_CONFLICT",
          });
        }

        // ── Collect all voucher IDs linked to this order ──

        // 1. DISCOUNT vouchers
        const discountLinks = await tx.orderDiscountVoucher.findMany({
          where: { order_id: id },
          select: { voucher_id: true },
        });

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

        // 3. Build unique set of all voucher IDs
        const allVoucherIds = new Set<string>();

        for (const link of discountLinks) {
          allVoucherIds.add(link.voucher_id);
        }
        for (const item of voucherItems) {
          if (item.product_voucher_id) allVoucherIds.add(item.product_voucher_id);
        }
        for (const av of addonVouchers) {
          allVoucherIds.add(av.voucher_id);
        }
        if (order.freeship_voucher_id) {
          allVoucherIds.add(order.freeship_voucher_id);
        }

        // ── Conditional batch redeem: RESERVED → REDEEMED ──
        await redeemOrderVouchers(tx, Array.from(allVoucherIds), "ONLINE", session.id);

        // NOTE: No order_complete or voucher_surplus points at ADMIN_CONFIRMED.
        // Points are awarded only at COMPLETED in the generic PATCH endpoint.

        return tx.order.findUniqueOrThrow({
          where: { id },
          include: { user: { select: { name: true, phone_number: true } } },
        });
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
        .catch((error: unknown) => {
          console.error("[AFTER JOB] Failed to send push", {
            name: error instanceof Error ? error.name : typeof error,
          });
        });
    });

    return NextResponse.json({ data: toPublicOrderDto(updatedOrder) });
  } catch (err) {
    if (err instanceof VoucherRedeemError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    if (err instanceof Error && (err as Error & { code?: string }).code === "STATUS_CONFLICT") {
      return NextResponse.json(
        { error: "Order status changed concurrently", code: "STATUS_CONFLICT" },
        { status: 409 }
      );
    }
    console.error("[PATCH /api/admin/orders/[id]/confirm-payment]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
