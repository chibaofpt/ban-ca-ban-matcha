import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildVietQRUrl } from "@/lib/vietqr";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

export const dynamic = "force-dynamic";

function toPublicOrderItems<T extends { product_voucher_id: string | null }>(items: T[]) {
  return items.map((item) => {
    const { product_voucher_id: _productVoucherId, ...publicItem } = item;
    void _productVoucherId;
    return publicItem;
  });
}

/**
 * Runs a lazy auto-cancel check for a PENDING order.
 * If auto_cancel_at has passed, cancels the order and restores ALL vouchers.
 * Returns true if the order was cancelled.
 */
async function tryLazyCancel(orderId: string, auto_cancel_at: Date | null): Promise<boolean> {
  if (!auto_cancel_at || auto_cancel_at > new Date()) return false;

  return prisma.$transaction(
    async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (claim.count !== 1) return false;

      await restoreVouchersOnCancel(tx, orderId);
      return true;
    },
    { maxWait: 5000, timeout: 10000 }
  );
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
            payment_method: order.payment_method,
            subtotal_vnd: order.subtotal_vnd,
            total_voucher_discount_vnd: order.total_voucher_discount_vnd,
            total_vnd: order.total_vnd,
            shipping_fee_vnd: order.shipping_fee_vnd,
            freeship_discount_vnd: order.freeship_discount_vnd,
            grand_total_vnd: order.grand_total_vnd,
            pickup_time: order.pickup_time,
            auto_cancel_at: order.auto_cancel_at,
            payment_qr_url: null,
            created_at: order.created_at,
            address_id: order.address_id,
            delivery_address: order.delivery_address,
            delivery_lat: order.delivery_lat,
            delivery_lng: order.delivery_lng,
            delivery_distance_km: order.delivery_distance_km,
            delivery_receiver_name: order.delivery_receiver_name,
            delivery_receiver_phone: order.delivery_receiver_phone,
            items: toPublicOrderItems(order.items),
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
        payment_qr_url = buildVietQRUrl({ amount: order.grand_total_vnd, orderCode: order.order_code });
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
        payment_method: order.payment_method,
        subtotal_vnd: order.subtotal_vnd,
        total_voucher_discount_vnd: order.total_voucher_discount_vnd,
        total_vnd: order.total_vnd,
        shipping_fee_vnd: order.shipping_fee_vnd,
        freeship_discount_vnd: order.freeship_discount_vnd,
        grand_total_vnd: order.grand_total_vnd,
        pickup_time: order.pickup_time,
        auto_cancel_at: order.auto_cancel_at,
        payment_qr_url,
        created_at: order.created_at,
        address_id: order.address_id,
        delivery_address: order.delivery_address,
        delivery_lat: order.delivery_lat,
        delivery_lng: order.delivery_lng,
        delivery_distance_km: order.delivery_distance_km,
        delivery_receiver_name: order.delivery_receiver_name,
        delivery_receiver_phone: order.delivery_receiver_phone,
        items: toPublicOrderItems(order.items),
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

/**
 * PATCH /api/orders/[id] — Customer self-cancels a PENDING order.
 * Body: { status: "CANCELLED" }
 * Only the order owner (CUSTOMER role) can cancel, and only while PENDING.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || body.status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Only status CANCELLED is accepted", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true, user_id: true },
    });

    if (!order || order.user_id !== session.id) {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (order.status !== "PENDING") {
      return NextResponse.json(
        { error: "Only PENDING orders can be cancelled by the customer", code: "INVALID_STATUS" },
        { status: 422 }
      );
    }

    const cancelled = await prisma.$transaction(
      async (tx) => {
        const claim = await tx.order.updateMany({
          where: { id: order.id, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        if (claim.count !== 1) return false;

        await restoreVouchersOnCancel(tx, order.id);
        return true;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    if (!cancelled) {
      return NextResponse.json(
        { error: "Order status changed concurrently", code: "CONFLICT" },
        { status: 409 }
      );
    }

    return NextResponse.json({ data: { id: order.id, status: "CANCELLED" } });
  } catch (err) {
    console.error("[PATCH /api/orders/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
