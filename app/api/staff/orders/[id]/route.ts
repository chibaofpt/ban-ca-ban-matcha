import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { toPublicOrderDto } from "@/lib/orderPublicDto";
import { redeemOrderVouchers, VoucherRedeemError } from "@/lib/redeemVouchers";
import { validateStaffOrderTransition } from "@/lib/staffOrderTransition";
import {
  assertCounterTransferOwnership,
  getAuthorizedStaffPaymentOrder,
  getPendingPaymentQrUrl,
  isPendingCounterTransfer,
  redeemCounterTransferVouchers,
  StaffPaymentAccessError,
} from "@/lib/staffOrderPayment";
import { z } from "zod";

export const dynamic = "force-dynamic";

const orderStatusPatchSchema = z.object({
  status: z.enum(["ADMIN_CONFIRMED", "STAFF_DONE", "COMPLETED", "CANCELLED"]),
});

/** GET /api/staff/orders/[id] — recover one authorized counter payment. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const { id } = await params;
    return NextResponse.json({ data: await getAuthorizedStaffPaymentOrder(id, session) });
  } catch (error) {
    if (error instanceof StaffPaymentAccessError) {
      const status = error.code === "NOT_FOUND" ? 404 : 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("[GET /api/staff/orders/[id]]", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = orderStatusPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid status", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const { status } = parsed.data;

    // Wrap the entire update logic in a transaction
    const updatedOrder = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            select: { 
              product_voucher_id: true,
              unit_price_vnd: true,
              productVoucher: { select: { covered_price_vnd: true } },
              addonVouchers: { select: { voucher_id: true } }
            }
          },
          discountVouchers: { select: { voucher_id: true } },
        },
      });
      if (!order) throw new Error("NOT_FOUND");

      const isPendingTransfer = isPendingCounterTransfer(order);
      assertCounterTransferOwnership(order, session);

      // Validate transition rules (includes orderType for cancel logic)
      const transitionError = validateStaffOrderTransition(
        order.status,
        status,
        session.role as "STAFF" | "ADMIN",
        order.order_type,
        order.payment_method,
      );
      if (transitionError) throw Object.assign(new Error(transitionError), { code: "INVALID_TRANSITION" });

      if (
        (status === "ADMIN_CONFIRMED" ||
          (status === "COMPLETED" && isPendingTransfer)) &&
        order.auto_cancel_at !== null &&
        order.auto_cancel_at <= new Date()
      ) {
        throw Object.assign(new Error("Order has expired and cannot be confirmed"), {
          code: "ORDER_EXPIRED",
        });
      }

      // Claim the transition before side effects. The status predicate makes concurrent
      // completion/cancellation attempts lose safely instead of awarding twice.
      const claimData: Prisma.OrderUncheckedUpdateInput = { status };
      if (order.handled_by === null && session.role === "STAFF") {
        claimData.handled_by = session.id;
      }
      const claim = await tx.order.updateMany({
        where:
          status === "ADMIN_CONFIRMED" ||
          (status === "COMPLETED" && isPendingTransfer)
            ? {
                id,
                status: order.status,
                OR: [{ auto_cancel_at: null }, { auto_cancel_at: { gt: new Date() } }],
              }
            : { id, status: order.status },
        data: claimData,
      });
      if (claim.count !== 1) {
        throw Object.assign(new Error("Order status changed concurrently"), {
          code: "STATUS_CONFLICT",
        });
      }

      // Remaining fields are written after all side effects succeed in this transaction.
      const dataToUpdate: Prisma.OrderUncheckedUpdateInput = {};

      // ── ADMIN_CONFIRMED: redeem vouchers (same logic as confirm-payment) ──
      if (status === "ADMIN_CONFIRMED") {
        const allVoucherIds = new Set<string>();
        if (order.freeship_voucher_id) allVoucherIds.add(order.freeship_voucher_id);
        for (const dv of order.discountVouchers) allVoucherIds.add(dv.voucher_id);
        for (const item of order.items) {
          if (item.product_voucher_id) allVoucherIds.add(item.product_voucher_id);
          for (const av of item.addonVouchers) allVoucherIds.add(av.voucher_id);
        }

        await redeemOrderVouchers(
          tx,
          Array.from(allVoucherIds),
          "ONLINE",
          session.id
        );

        // Add payment metadata
        dataToUpdate.payment_confirmed_at = new Date();
        dataToUpdate.payment_confirmed_by = session.id;

        // NOTE: No points at ADMIN_CONFIRMED — only at COMPLETED.
      }

      // ── COUNTER TRANSFER COMPLETED: receive payment, then redeem OFFLINE ──
      if (status === "COMPLETED" && isPendingTransfer) {
        await redeemCounterTransferVouchers(tx, order, session.id);
        dataToUpdate.payment_confirmed_at = new Date();
        dataToUpdate.payment_confirmed_by = session.id;
      }

      // ── COMPLETED: award points + surplus ──
      if (status === "COMPLETED" && order.points_earned === null) {
        if (order.user_id) {
          // Points from total_vnd (excludes shipping), NOT grand_total_vnd
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

          // Aggregate surplus: sum VND surplus first, then floor to points once
          const itemsWithProduct = order.items.filter(
            (item) => item.product_voucher_id && item.productVoucher?.covered_price_vnd != null
          );
          if (itemsWithProduct.length > 0) {
            const totalSurplusVnd = itemsWithProduct.reduce((sum, item) => {
              const coveredPrice = item.productVoucher?.covered_price_vnd ?? 0;
              const surplus = Math.max(coveredPrice - item.unit_price_vnd, 0);
              return sum + surplus;
            }, 0);
            const surplusPoints = Math.floor(totalSurplusVnd / 10000);

            if (surplusPoints > 0) {
              await tx.user.update({
                where: { id: order.user_id },
                data: { points_balance: { increment: surplusPoints } },
              });
              await tx.pointsLog.create({
                data: {
                  user_id: order.user_id,
                  delta: surplusPoints,
                  reason: "voucher_surplus",
                  voucher_id: null, // Aggregate — not per-item
                  order_id: order.id,
                  performed_by: session.id,
                },
              });
            }
          }
        } else {
          // Anonymous order — zero points
          dataToUpdate.points_earned = 0;
        }
      }

      // ── CANCELLED: restore vouchers ──
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

      // NOTE: No voucher redeem at COMPLETED — already done at ADMIN_CONFIRMED.

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

    return NextResponse.json({
      data: {
        ...toPublicOrderDto(updatedOrder),
        payment_qr_url: getPendingPaymentQrUrl(updatedOrder),
        skipped_vouchers: [],
      },
    });

  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
      }
      const code = (err as Error & { code?: string }).code;
      if (code === "INVALID_TRANSITION") {
        return NextResponse.json({ error: err.message, code: "INVALID_TRANSITION" }, { status: 400 });
      }
      if (code === "FORBIDDEN") {
        return NextResponse.json({ error: err.message, code: "FORBIDDEN" }, { status: 403 });
      }
      if (code === "ORDER_EXPIRED") {
        return NextResponse.json({ error: err.message, code: "ORDER_EXPIRED" }, { status: 422 });
      }
      if (code === "STATUS_CONFLICT" || err instanceof VoucherRedeemError) {
        return NextResponse.json(
          { error: err.message, code: code ?? "VOUCHER_MISMATCH" },
          { status: 409 }
        );
      }
    }
    console.error("[PATCH /api/staff/orders/[id]]", err);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
