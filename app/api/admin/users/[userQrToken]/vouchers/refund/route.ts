import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { AccountError, accountErrorResponse } from "@/lib/auth/accountError";
import { captureServerException } from "@/lib/observability";
import { adminUserVoucherRefundSchema } from "@/lib/validations/adminUser";
import { AdminVoucherRefundError, refundAdminUserVoucher } from "@/lib/vouchers/adminVoucherRefund";

/** Allows an Admin to voluntarily refund an eligible CUSTOMER points-exchange voucher. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ userQrToken: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const { userQrToken } = await params;
  if (!z.string().uuid().safeParse(userQrToken).success) {
    return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
  }
  const parsed = adminUserVoucherRefundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  try {
    const data = await refundAdminUserVoucher(userQrToken, parsed.data.qr_token, session.id);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AccountError) return accountErrorResponse(error);
    if (error instanceof AdminVoucherRefundError) {
      const status = error.reason === "NOT_FOUND" ? 404
        : ["VOUCHER_NOT_ACTIVE", "VOUCHER_ALREADY_REFUNDED", "VOUCHER_ORDER_CONFLICT", "VOUCHER_REFUND_CONFLICT"].includes(error.reason) ? 409 : 422;
      return NextResponse.json({ error: error.message, code: status === 404 ? "NOT_FOUND"
        : status === 409 ? "CONFLICT" : "BUSINESS_RULE_VIOLATION", details: { reason: error.reason } }, { status });
    }
    captureServerException(error, { operation: "refund_admin_user_voucher" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
