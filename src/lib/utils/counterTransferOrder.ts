import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  StaffOrderResult,
} from "@/src/lib/types/order";

export interface CounterTransferOrderSummary {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method?: PaymentMethod;
  order_code: string | null;
  auto_cancel_at: string | null;
  payment_qr_url?: string | null;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  points_earned?: number | null;
  skipped_vouchers?: string[];
}

/** Resolve payment method for new responses and one-release legacy order fixtures. */
export function resolveOrderPaymentMethod(
  orderType: OrderType,
  paymentMethod: PaymentMethod | undefined,
): PaymentMethod {
  return paymentMethod ?? (orderType === "COUNTER" ? "CASH" : "BANK_TRANSFER");
}

/** Convert an eligible pending counter order into the locked payment-modal snapshot. */
export function toCounterTransferPayment(
  order: CounterTransferOrderSummary,
): StaffOrderResult | null {
  if (
    order.status !== "PENDING" ||
    order.order_type !== "COUNTER" ||
    order.payment_method !== "BANK_TRANSFER" ||
    !order.order_code ||
    !order.auto_cancel_at ||
    !order.payment_qr_url
  ) {
    return null;
  }

  return {
    id: order.id,
    status: order.status,
    order_type: order.order_type,
    payment_method: order.payment_method,
    order_code: order.order_code,
    auto_cancel_at: order.auto_cancel_at,
    payment_qr_url: order.payment_qr_url,
    subtotal_vnd: order.subtotal_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd,
    total_vnd: order.total_vnd,
    shipping_fee_vnd: order.shipping_fee_vnd,
    freeship_discount_vnd: order.freeship_discount_vnd,
    grand_total_vnd: order.grand_total_vnd,
    points_earned: order.points_earned ?? null,
    skipped_vouchers: order.skipped_vouchers ?? [],
  };
}

/** Keep only server-authoritative pending counter transfers that can reopen VietQR. */
export function collectPendingCounterTransfers(
  orders: CounterTransferOrderSummary[],
): StaffOrderResult[] {
  return orders.flatMap((order) => {
    const payment = toCounterTransferPayment(order);
    return payment ? [payment] : [];
  });
}

/** Decide whether the pending-transfer launcher is hidden, direct, or list-first. */
export function getPendingTransferLaunchMode(
  paymentCount: number,
): "HIDDEN" | "DIRECT" | "LIST" {
  if (paymentCount <= 0) return "HIDDEN";
  if (paymentCount === 1) return "DIRECT";
  return "LIST";
}
