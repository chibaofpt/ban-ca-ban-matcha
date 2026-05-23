import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

/**
 * Runs a lazy auto-cancel check for a PENDING order.
 * If auto_cancel_at has passed, cancels the order and restores any RESERVED voucher.
 * Returns true if the order was cancelled.
 */
async function tryLazyCancel(orderId: string, auto_cancel_at: Date | null): Promise<boolean> {
  if (!auto_cancel_at || auto_cancel_at > new Date()) return false;

  await prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, voucher_id: true },
      });
      // Only cancel if still PENDING (prevent double-cancel race)
      if (!order || order.status !== "PENDING") return;

      await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
      });

      if (order.voucher_id) {
        await tx.voucher.update({
          where: { id: order.voucher_id },
          data: { status: "ACTIVE" },
        });
      }
    },
    { maxWait: 5000, timeout: 10000 }
  );

  return true;
}

/** GET /api/orders/[id] — Customer polls own order status for tracking. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            menuItem: { select: { name: true, category: true } },
            selectedPowder: { select: { name: true } },
            milkType: { select: { name: true, is_default: true } },
            addons: {
              include: {
                addonOption: {
                  select: {
                    label: true,
                    gram_value: true,
                    price_vnd: true,
                    group: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Security: customers can only view their own orders
    if (order.user_id !== session.id) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Lazy auto-cancel check — inline if expired
    if (order.status === "PENDING") {
      const wasCancelled = await tryLazyCancel(order.id, order.auto_cancel_at);
      if (wasCancelled) {
        // Return the cancelled state immediately without another DB read
        return NextResponse.json({
          data: {
            id: order.id,
            order_code: order.order_code,
            status: "CANCELLED",
            order_type: order.order_type,
            voucher_id: order.voucher_id,
            subtotal_vnd: order.subtotal_vnd,
            discount_vnd: order.discount_vnd,
            total_vnd: order.total_vnd,
            pickup_time: order.pickup_time,
            auto_cancel_at: order.auto_cancel_at,
            payment_qr_url: null,
            created_at: order.created_at,
            items: order.items,
          },
        });
      }
    }

    // Only return QR URL while order is still PENDING and awaiting payment
    let payment_qr_url: string | null = null;
    if (
      order.status === "PENDING" &&
      order.order_code &&
      order.order_type !== "COUNTER"
    ) {
      try {
        payment_qr_url = buildVietQRUrl({ amount: order.total_vnd, orderCode: order.order_code });
      } catch {
        // Missing env vars in dev — non-fatal for tracking page
        payment_qr_url = null;
      }
    }

    return NextResponse.json({
      data: {
        id: order.id,
        order_code: order.order_code,
        status: order.status,
        order_type: order.order_type,
        voucher_id: order.voucher_id,
        subtotal_vnd: order.subtotal_vnd,
        discount_vnd: order.discount_vnd,
        total_vnd: order.total_vnd,
        pickup_time: order.pickup_time,
        auto_cancel_at: order.auto_cancel_at,
        payment_qr_url,
        created_at: order.created_at,
        items: order.items,
      },
    });
  } catch (err) {
    console.error("[GET /api/orders/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
