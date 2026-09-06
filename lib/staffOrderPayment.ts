import { generateOrderCode } from "@/lib/orderCode";
import { OrderValidationError } from "@/lib/orders";
import { toPublicOrderDto } from "@/lib/orderPublicDto";
import { prisma } from "@/lib/prisma";
import { redeemOrderVouchers } from "@/lib/redeemVouchers";
import { buildVietQRUrl } from "@/lib/vietqr";
import type { OrderStatus, OrderType, PaymentMethod, Prisma } from "@prisma/client";

export type StaffPaymentMethod = "CASH" | "BANK_TRANSFER";

const COUNTER_TRANSFER_TIMEOUT_MS = 20 * 60 * 1000;

/** Error for a valid payload that cannot use the selected payment method. */
export class StaffPaymentBusinessError extends Error {
  constructor(
    public readonly reason: "ZERO_TOTAL_BANK_TRANSFER",
    message: string,
  ) {
    super(message);
    this.name = "StaffPaymentBusinessError";
  }
}

/** Authorization or lookup error raised while recovering a staff payment. */
export class StaffPaymentAccessError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "StaffPaymentAccessError";
  }
}

/** Server-owned fields that distinguish immediate cash from pending bank transfer orders. */
export interface CounterPaymentPreparation {
  paymentMethod: StaffPaymentMethod;
  status: "COMPLETED" | "PENDING";
  orderCode: string | null;
  autoCancelAt: Date | null;
  paymentQrUrl: string | null;
  pointsAreDeferred: boolean;
}

/** Prepare server-authoritative payment metadata before any order write occurs. */
export async function prepareCounterPayment(
  paymentMethod: StaffPaymentMethod,
  grandTotalVnd: number,
  db: Parameters<typeof generateOrderCode>[0] = prisma,
): Promise<CounterPaymentPreparation> {
  if (paymentMethod === "CASH") {
    return {
      paymentMethod,
      status: "COMPLETED",
      orderCode: null,
      autoCancelAt: null,
      paymentQrUrl: null,
      pointsAreDeferred: false,
    };
  }

  if (grandTotalVnd <= 0) {
    throw new StaffPaymentBusinessError(
      "ZERO_TOTAL_BANK_TRANSFER",
      "Đơn 0đ không cần chuyển khoản. Vui lòng chọn tiền mặt.",
    );
  }

  const orderCode = await generateOrderCode(db);
  const paymentQrUrl = buildVietQRUrl({ amount: grandTotalVnd, orderCode });
  return {
    paymentMethod,
    status: "PENDING",
    orderCode,
    autoCancelAt: new Date(Date.now() + COUNTER_TRANSFER_TIMEOUT_MS),
    paymentQrUrl,
    pointsAreDeferred: true,
  };
}

interface CreatedCounterOrder {
  id: string;
  status: OrderStatus;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  points_earned: number | null;
}

/** Map a created counter order to the stable staff payment response contract. */
export function toStaffOrderPaymentResult(
  order: CreatedCounterOrder,
  payment: CounterPaymentPreparation,
  skippedVouchers: string[],
): Record<string, unknown> {
  return {
    id: order.id,
    status: order.status,
    order_type: "COUNTER",
    payment_method: payment.paymentMethod,
    order_code: payment.orderCode,
    auto_cancel_at: payment.autoCancelAt,
    payment_qr_url: payment.paymentQrUrl,
    subtotal_vnd: order.subtotal_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd,
    total_vnd: order.total_vnd,
    shipping_fee_vnd: order.shipping_fee_vnd,
    freeship_discount_vnd: order.freeship_discount_vnd,
    grand_total_vnd: order.grand_total_vnd,
    points_earned: order.points_earned,
    skipped_vouchers: skippedVouchers,
  };
}

type VoucherClaimTx = Pick<Prisma.TransactionClient, "voucher">;

/** Atomically reserve a transfer voucher or redeem a cash voucher from ACTIVE state. */
export async function claimCounterVoucher(
  tx: VoucherClaimTx,
  voucherId: string,
  paymentMethod: StaffPaymentMethod,
  performedBy: string,
  conflictMessage: string,
): Promise<void> {
  const isTransfer = paymentMethod === "BANK_TRANSFER";
  const result = await tx.voucher.updateMany({
    where: { id: voucherId, status: "ACTIVE" },
    data: isTransfer
      ? { status: "RESERVED" }
      : {
          status: "REDEEMED",
          used_channel: "OFFLINE",
          redeemed_at: new Date(),
          redeemed_by: performedBy,
        },
  });

  if (result.count !== 1) {
    throw new OrderValidationError("CONFLICT", conflictMessage);
  }
}

interface CounterTransferDescriptor {
  status: OrderStatus;
  order_type: OrderType;
  payment_method: PaymentMethod;
  handled_by: string | null;
}

interface CounterTransferVoucherOrder {
  id: string;
  discountVouchers: Array<{ voucher_id: string }>;
  items: Array<{
    product_voucher_id: string | null;
    item_voucher_id: string | null;
    addonVouchers: Array<{ voucher_id: string }>;
  }>;
  bundleApplications: Array<{ voucher_id: string; status: string }>;
}

type CounterTransferRedeemTx = Pick<
  Prisma.TransactionClient,
  "voucher" | "orderBundleApplication"
>;

/** Return whether an order is the direct-confirmation counter transfer variant. */
export function isPendingCounterTransfer(
  order: Pick<CounterTransferDescriptor, "status" | "order_type" | "payment_method">,
): boolean {
  return (
    order.status === "PENDING" &&
    order.order_type === "COUNTER" &&
    order.payment_method === "BANK_TRANSFER"
  );
}

/** Enforce that Staff can manage only counter transfers they created. */
export function assertCounterTransferOwnership(
  order: CounterTransferDescriptor,
  session: { id: string; role: string },
): void {
  if (
    isPendingCounterTransfer(order) &&
    session.role === "STAFF" &&
    order.handled_by !== session.id
  ) {
    throw new StaffPaymentAccessError(
      "FORBIDDEN",
      "Staff can only manage their own counter transfers",
    );
  }
}

/** Redeem every reserved counter-transfer voucher exactly once through the shared helper. */
export async function redeemCounterTransferVouchers(
  tx: CounterTransferRedeemTx,
  order: CounterTransferVoucherOrder,
  performedBy: string,
): Promise<void> {
  const voucherIds = new Set<string>();
  for (const voucher of order.discountVouchers) voucherIds.add(voucher.voucher_id);
  for (const item of order.items) {
    if (item.product_voucher_id) voucherIds.add(item.product_voucher_id);
    if (item.item_voucher_id) voucherIds.add(item.item_voucher_id);
    for (const voucher of item.addonVouchers) voucherIds.add(voucher.voucher_id);
  }
  for (const application of order.bundleApplications) {
    voucherIds.add(application.voucher_id);
  }
  await redeemOrderVouchers(tx, Array.from(voucherIds), "OFFLINE", performedBy);
  if (order.bundleApplications.length > 0) {
    const promoted = await tx.orderBundleApplication.updateMany({
      where: {
        order_id: order.id,
        voucher_id: { in: order.bundleApplications.map(({ voucher_id }) => voucher_id) },
        status: "RESERVED",
      },
      data: { status: "REDEEMED" },
    });
    if (promoted.count !== order.bundleApplications.length) {
      throw new OrderValidationError("CONFLICT", "BUNDLE application changed concurrently");
    }
  }
}

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
): Promise<Record<string, unknown>> {
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
    ...toPublicOrderDto(order),
    payment_qr_url: getPendingPaymentQrUrl(order),
    skipped_vouchers: [],
  };
}
