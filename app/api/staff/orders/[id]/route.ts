import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { OrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: "Status is required", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    // Wrap the entire update logic in a transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) {
        throw new Error("NOT_FOUND");
      }

      // 1. Ownership check: Staff can only modify their own orders OR unhandled pending orders
      if (
        session.role === "STAFF" &&
        order.handled_by !== null &&
        order.handled_by !== session.id
      ) {
        throw new Error("FORBIDDEN");
      }

      // 2. Prepare update data
      const dataToUpdate: Prisma.OrderUncheckedUpdateInput = { status: status as OrderStatus };
      
      // Auto-assign to current staff if not yet assigned
      if (order.handled_by === null && session.role === "STAFF") {
        dataToUpdate.handled_by = session.id;
      }

      // 3. Award points if status transitions to COMPLETED and points haven't been awarded yet
      if (status === "COMPLETED" && order.status !== "COMPLETED" && order.points_earned === null) {
        if (order.user_id) {
          // Non-anonymous order — award points normally
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
          // Anonymous order — mark as complete with zero points, no user to update
          dataToUpdate.points_earned = 0;
        }
      }

      // 4. Update the order
      const result = await tx.order.update({
        where: { id },
        data: dataToUpdate,
        include: {
          user: { select: { name: true, phone_number: true } },
          handler: { select: { name: true } },
        }
      });

      return result;
    });

    return NextResponse.json({ data: updatedOrder });

  } catch (err: any) {
    if (err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Order is being handled by someone else", code: "FORBIDDEN" }, { status: 403 });
    }

    console.error("[PATCH /api/staff/orders/[id]]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
