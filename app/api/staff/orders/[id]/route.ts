import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { OrderStatus, OrderType, Prisma } from "@prisma/client";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

export const dynamic = "force-dynamic";

/**
 * Validates a status transition given the caller's role and order type.
 * Returns an error string if invalid, null if allowed.
 */
function validateTransition(
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  role: "STAFF" | "ADMIN",
  orderType: OrderType
): string | null {
  switch (newStatus) {
    case "ADMIN_CONFIRMED":
      // Only admin can confirm payment, and only from PENDING
      if (role !== "ADMIN") return "Only ADMIN can confirm payment";
      if (currentStatus !== "PENDING") return "Can only confirm payment for PENDING orders";
      return null;

    case "STAFF_DONE":
      // Staff or admin can mark done, but only from ADMIN_CONFIRMED
      if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
        return `Order is already ${currentStatus} — no further transitions allowed`;
      }
      if (currentStatus !== "ADMIN_CONFIRMED") {
        return "Order must be ADMIN_CONFIRMED before marking as STAFF_DONE";
      }
      return null;

    case "COMPLETED":
      // Staff or admin can complete, but only from STAFF_DONE
      if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
        return `Order is already ${currentStatus} — no further transitions allowed`;
      }
      if (currentStatus !== "STAFF_DONE") {
        return "Order must be STAFF_DONE before completing — cannot skip steps";
      }
      return null;

    case "CANCELLED":
      // Only ADMIN can cancel — staff is never allowed
      if (role !== "ADMIN") return "Only ADMIN can cancel orders";
      // Already cancelled — no-op
      if (currentStatus === "CANCELLED") return "Order is already CANCELLED";
      // COMPLETED online orders cannot be cancelled
      if (currentStatus === "COMPLETED" && orderType !== "COUNTER") {
        return "Completed online orders cannot be cancelled";
      }
      // Allow: COMPLETED+COUNTER (staff mistake), PENDING, ADMIN_CONFIRMED, STAFF_DONE
      return null;

    default:
      return `Invalid target status: ${newStatus}`;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body as { status: OrderStatus };

    if (!status) {
      return NextResponse.json({ error: "Status is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // Wrap the entire update logic in a transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: { select: { product_voucher_id: true } },
        },
      });
      if (!order) throw new Error("NOT_FOUND");

      // Validate transition rules (includes orderType for cancel logic)
      const transitionError = validateTransition(
        order.status,
        status,
        session.role as "STAFF" | "ADMIN",
        order.order_type
      );
      if (transitionError) throw Object.assign(new Error(transitionError), { code: "INVALID_TRANSITION" });

      // Prepare update data
      const dataToUpdate: Prisma.OrderUncheckedUpdateInput = { status };

      // Auto-assign to current staff if not yet assigned (counter orders)
      if (order.handled_by === null && session.role === "STAFF") {
        dataToUpdate.handled_by = session.id;
      }

      // Award points when → COMPLETED
      if (status === "COMPLETED" && order.points_earned === null) {
        if (order.user_id) {
          const points_earned = Math.floor(order.total_vnd / 10000);
          dataToUpdate.points_earned = points_earned;

          if (points_earned > 0) {
            await tx.user.update({
              where: { id: order.user_id },
              data: { points_balance: { increment: points_earned } },
            });
            await tx.pointsLog.create({
              data: {
                user_id: order.user_id,
                delta: points_earned,
                reason: "order_complete",
                order_id: order.id,
                performed_by: session.id,
              },
            });
          }
        } else {
          // Anonymous order — zero points
          dataToUpdate.points_earned = 0;
        }
      }

      // When cancelling: restore ALL vouchers to ACTIVE.
      // For COMPLETED COUNTER orders, also reverse the order_complete points.
      if (status === "CANCELLED") {
        const isCancellingCompleted = order.status === "COMPLETED";
        await restoreVouchersOnCancel(tx, id, {
          reverseCompletionPoints: isCancellingCompleted,
          performedBy: session.id,
        });
        // Zero out points_earned so the order history is accurate
        if (isCancellingCompleted) {
          dataToUpdate.points_earned = 0;
        }
      }

      // When → COMPLETED: mark all PRODUCT vouchers as REDEEMED
      if (status === "COMPLETED") {
        const pvItems = order.items.filter((i: { product_voucher_id: string | null }) => i.product_voucher_id !== null);
        const uniquePvIds = [...new Set(pvItems.map((i: { product_voucher_id: string | null }) => i.product_voucher_id as string))];
        for (const pvId of uniquePvIds) {
          const pv = await tx.voucher.findUnique({
            where: { id: pvId },
            select: { status: true },
          });
          if (pv && pv.status === "RESERVED") {
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
        }
      }

      const result = await tx.order.update({
        where: { id },
        data: dataToUpdate,
        include: {
          user: { select: { name: true, phone_number: true } },
          handler: { select: { name: true } },
        },
      });

      return result;
    }, { maxWait: 5000, timeout: 10000 });

    return NextResponse.json({ data: updatedOrder });

  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
      }
      const code = (err as Error & { code?: string }).code;
      if (code === "INVALID_TRANSITION") {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 400 });
      }
    }
    console.error("[PATCH /api/staff/orders/[id]]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
