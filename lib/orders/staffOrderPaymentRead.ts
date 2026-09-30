import type { StaffOrderResult } from "@/contracts/order";
import { StaffPaymentAccessError } from "@/lib/orders/staffOrderPayment";
import { serializeOrderDate } from "@/lib/orders/orderPublicDto";
import { prisma } from "@/lib/prisma";
import { buildVietQRUrl } from "@/lib/vietqr";
import type { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";

interface PaymentQrOrder {
  status: OrderStatus;
  payment_method: PaymentMethod;
  order_code: string | null;
  grand_total_vnd: number;
}

/** Build a VietQR URL only for pending bank-transfer orders, failing closed to null. */
export function getPendingPaymentQrUrl(order: PaymentQrOrder): string | null {
  if (
    order.status !== "PENDING" ||
    order.payment_method !== "BANK_TRANSFER" ||
    !order.order_code
  ) {
    return null;
  }
  try {
    return buildVietQRUrl({ amount: order.grand_total_vnd, orderCode: order.order_code });
  } catch {
    return null;
  }
}

/** Return the order filter for an Admin pending tab or a Staff-owned counter transfer tab. */
export function getPendingPaymentWhere(
  role: string,
  staffId: string,
  mineOnly = false,
): Prisma.OrderWhereInput {
  if (role === "STAFF" || mineOnly) {
    return {
      status: "PENDING",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      handled_by: staffId,
    };
  }
  return { status: "PENDING" };
}

/** Load one authorized staff order and map its recoverable payment fields. */
export async function getAuthorizedStaffPaymentOrder(
  orderId: string,
  session: { id: string; role: string },
): Promise<StaffOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      order_type: true,
      payment_method: true,
      order_code: true,
      auto_cancel_at: true,
      subtotal_vnd: true,
      total_voucher_discount_vnd: true,
      total_vnd: true,
      shipping_fee_vnd: true,
      freeship_discount_vnd: true,
      grand_total_vnd: true,
      points_earned: true,
      handled_by: true,
      created_at: true,
    },
  });
  if (!order) throw new StaffPaymentAccessError("NOT_FOUND", "Order not found");
  if (
    session.role === "STAFF" &&
    (order.order_type !== "COUNTER" || order.handled_by !== session.id)
  ) {
    throw new StaffPaymentAccessError("FORBIDDEN", "Forbidden");
  }

  return {
    id: order.id,
    status: order.status,
    order_type: order.order_type,
    payment_method: order.payment_method,
    order_code: order.order_code,
    auto_cancel_at: serializeOrderDate(order.auto_cancel_at),
    payment_qr_url: getPendingPaymentQrUrl(order),
    subtotal_vnd: order.subtotal_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd,
    total_vnd: order.total_vnd,
    shipping_fee_vnd: order.shipping_fee_vnd,
    freeship_discount_vnd: order.freeship_discount_vnd,
    grand_total_vnd: order.grand_total_vnd,
    points_earned: order.points_earned,
    skipped_vouchers: [],
    created_at: serializeOrderDate(order.created_at),
  };
}
