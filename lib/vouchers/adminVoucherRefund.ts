import type { Prisma } from "@prisma/client";
import type { AdminUserVoucherRefundResult } from "@/contracts/admin/user";
import { prisma } from "@/lib/prisma";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { runSerializableTransaction } from "@/lib/serializableTransaction";

const MAX_INT = 2_147_483_647;
type RefundDb = Pick<Prisma.TransactionClient, "pointsLog" | "order">;
type RefundVoucher = { id: string; user_id: string; issued_via: string; status: string; expires_at: Date | null };
type RefundReason = "NOT_FOUND" | "VOUCHER_SOURCE_NOT_REFUNDABLE" | "VOUCHER_EXPIRED"
  | "VOUCHER_NOT_ACTIVE" | "VOUCHER_ALREADY_REFUNDED" | "VOUCHER_ORDER_CONFLICT"
  | "VOUCHER_PURCHASE_AUDIT_INVALID" | "VOUCHER_PURCHASE_ALREADY_REVERSED"
  | "POINTS_BALANCE_OVERFLOW" | "VOUCHER_REFUND_CONFLICT";
type RefundEligibility = { can_refund: true; refundable_points: number; purchase_log_id: string }
  | { can_refund: false; refundable_points: null; reason: RefundReason };
const refundMessages: Record<RefundReason, string> = {
  NOT_FOUND: "Không tìm thấy khách hàng hoặc voucher.",
  VOUCHER_SOURCE_NOT_REFUNDABLE: "Chỉ có thể hoàn điểm cho voucher được đổi bằng điểm.",
  VOUCHER_EXPIRED: "Voucher đã hết hạn.",
  VOUCHER_NOT_ACTIVE: "Voucher không còn ở trạng thái có thể hoàn điểm.",
  VOUCHER_ALREADY_REFUNDED: "Voucher đã được hoàn điểm.",
  VOUCHER_ORDER_CONFLICT: "Voucher đang được dùng cho một đơn hàng, không thể hoàn điểm.",
  VOUCHER_PURCHASE_AUDIT_INVALID: "Không tìm thấy lịch sử đổi điểm hợp lệ để hoàn voucher.",
  VOUCHER_PURCHASE_ALREADY_REVERSED: "Lịch sử đổi điểm của voucher đã được hoàn trước đó.",
  POINTS_BALANCE_OVERFLOW: "Số dư điểm sau khi hoàn vượt quá giới hạn cho phép.",
  VOUCHER_REFUND_CONFLICT: "Voucher vừa thay đổi. Vui lòng tải lại và thử hoàn điểm.",
};

/** Represents a safe public rejection of an Admin voucher refund. */
export class AdminVoucherRefundError extends Error {
  constructor(public readonly reason: RefundReason) { super(refundMessages[reason]); }
}

/** Resolves Admin refund eligibility using bounded audit reads and order existence checks. */
export async function getAdminVoucherRefundEligibility(
  db: RefundDb, voucher: RefundVoucher, pointsBalance: number, now: Date,
): Promise<RefundEligibility> {
  const reject = (reason: RefundReason): RefundEligibility => ({ can_refund: false, refundable_points: null, reason });
  if (voucher.issued_via !== "POINTS_EXCHANGE") return reject("VOUCHER_SOURCE_NOT_REFUNDABLE");
  if (voucher.status === "REFUNDED") return reject("VOUCHER_ALREADY_REFUNDED");
  if (voucher.status === "EXPIRED") return reject("VOUCHER_EXPIRED");
  if (voucher.status !== "ACTIVE") return reject("VOUCHER_NOT_ACTIVE");
  if (voucher.expires_at && voucher.expires_at <= now) return reject("VOUCHER_EXPIRED");
  const purchases = await db.pointsLog.findMany({
    where: { voucher_id: voucher.id, reason: "voucher_purchase" }, take: 2,
    select: { id: true, user_id: true, voucher_id: true, delta: true, order_id: true, reversed_log_id: true },
  });
  const purchase = purchases[0];
  if (purchases.length !== 1 || !purchase || purchase.user_id !== voucher.user_id
    || purchase.voucher_id !== voucher.id || purchase.order_id !== null || purchase.reversed_log_id !== null
    || !Number.isInteger(purchase.delta) || purchase.delta >= 0 || purchase.delta < -MAX_INT) {
    return reject("VOUCHER_PURCHASE_AUDIT_INVALID");
  }
  const [reversal, order] = await Promise.all([
    db.pointsLog.findFirst({ where: { OR: [
      { reversed_log_id: purchase.id }, { voucher_id: voucher.id, reason: "voucher_refund" },
    ] }, select: { id: true } }),
    db.order.findFirst({ where: { status: { not: "CANCELLED" }, OR: [
      { freeship_voucher_id: voucher.id },
      { discountVouchers: { some: { voucher_id: voucher.id } } },
      { items: { some: { OR: [
        { product_voucher_id: voucher.id }, { item_voucher_id: voucher.id },
        { addonVouchers: { some: { voucher_id: voucher.id } } },
      ] } } },
      { bundleApplications: { some: { voucher_id: voucher.id } } },
    ] }, select: { id: true } }),
  ]);
  if (reversal) return reject("VOUCHER_PURCHASE_ALREADY_REVERSED");
  if (order) return reject("VOUCHER_ORDER_CONFLICT");
  const points = -purchase.delta;
  if (!Number.isInteger(pointsBalance) || pointsBalance < 0 || pointsBalance > MAX_INT - points) {
    return reject("POINTS_BALANCE_OVERFLOW");
  }
  return { can_refund: true, refundable_points: points, purchase_log_id: purchase.id };
}

/** Refunds the original full purchase cost and appends an Admin reversal in one transaction. */
export async function refundAdminUserVoucher(
  userQrToken: string, voucherQrToken: string, adminId: string,
): Promise<AdminUserVoucherRefundResult> {
  try {
    return await runSerializableTransaction(prisma, async (tx) => {
      const user = await tx.user.findFirst({
        where: { qr_token: userQrToken, role: "CUSTOMER", sourceMerge: { is: null } },
        select: { id: true, points_balance: true },
      });
      if (!user) throw new AdminVoucherRefundError("NOT_FOUND");
      await claimActiveCustomerForWrite(tx, user.id, { allowBlocked: true });
      const voucher = await tx.voucher.findFirst({
        where: { qr_token: voucherQrToken, user_id: user.id },
        select: { id: true, user_id: true, qr_token: true, issued_via: true, status: true, expires_at: true },
      });
      if (!voucher) throw new AdminVoucherRefundError("NOT_FOUND");
      const now = new Date();
      const eligibility = await getAdminVoucherRefundEligibility(tx, voucher, user.points_balance, now);
      if (!eligibility.can_refund) throw new AdminVoucherRefundError(eligibility.reason);
      const claimed = await tx.voucher.updateMany({
        where: { id: voucher.id, user_id: user.id, issued_via: "POINTS_EXCHANGE", status: "ACTIVE",
          OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
        data: { status: "REFUNDED" },
      });
      if (claimed.count !== 1) throw new AdminVoucherRefundError("VOUCHER_REFUND_CONFLICT");
      const credited = await tx.user.updateMany({
        where: { id: user.id, role: "CUSTOMER", sourceMerge: { is: null },
          points_balance: { lte: MAX_INT - eligibility.refundable_points } },
        data: { points_balance: { increment: eligibility.refundable_points } },
      });
      if (credited.count !== 1) throw new AdminVoucherRefundError("POINTS_BALANCE_OVERFLOW");
      await tx.pointsLog.create({ data: {
        user_id: user.id, voucher_id: voucher.id, delta: eligibility.refundable_points,
        reason: "voucher_refund", performed_by: adminId, reversed_log_id: eligibility.purchase_log_id, order_id: null,
      } });
      const updated = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { points_balance: true } });
      return { qr_token: voucher.qr_token, status: "REFUNDED", points_refunded: eligibility.refundable_points,
        points_balance: updated.points_balance };
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2034") {
      throw new AdminVoucherRefundError("VOUCHER_REFUND_CONFLICT");
    }
    throw error;
  }
}
