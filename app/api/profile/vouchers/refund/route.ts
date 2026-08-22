import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  attachOwnedVoucherAvailability,
  loadVoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";

export const dynamic = "force-dynamic";
const refundSchema = z.object({ qr_token: z.string().min(1) });

class RefundRuleError extends Error {
  constructor(
    readonly status: number,
    readonly code: "NOT_FOUND" | "CONFLICT" | "BUSINESS_RULE_VIOLATION",
    message: string,
    readonly reason?: string,
  ) { super(message); }
}

function isSerializationConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}

/** POST /api/profile/vouchers/refund — Refund an unusable points-exchange voucher. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const voucher = await tx.voucher.findUnique({
            where: { qr_token: parsed.data.qr_token },
            include: {
              package: { include: { bundleRule: { include: { productScopes: { include: { sizes: true } }, addonRewards: true } } } },
              pointsLogs: { where: { reason: "voucher_purchase" }, select: { delta: true, reason: true }, orderBy: { created_at: "asc" }, take: 1 },
            },
          });
          if (!voucher || voucher.user_id !== session.id) throw new RefundRuleError(404, "NOT_FOUND", "Voucher not found or does not belong to you");
          if (voucher.status !== "ACTIVE") throw new RefundRuleError(409, "CONFLICT", `Voucher cannot be refunded in status: ${voucher.status}`);
          if (voucher.issued_via !== "POINTS_EXCHANGE") throw new RefundRuleError(422, "BUSINESS_RULE_VIOLATION", "Only points-exchange vouchers can be refunded", "REFUND_NOT_POINTS_EXCHANGE");
          const now = new Date();
          if (voucher.expires_at && voucher.expires_at <= now) throw new RefundRuleError(422, "BUSINESS_RULE_VIOLATION", "Expired vouchers cannot be refunded", "REFUND_EXPIRED");

          const catalog = await loadVoucherAvailabilityCatalog(tx as unknown as VoucherAvailabilityDatabase);
          const resolved = attachOwnedVoucherAvailability([voucher], catalog, now)[0];
          if (!resolved || resolved.availability.can_apply) throw new RefundRuleError(409, "CONFLICT", "Voucher still has an active usable target", "VOUCHER_STILL_USABLE");
          const purchaseDelta = voucher.pointsLogs[0]?.delta;
          if (purchaseDelta === undefined || purchaseDelta >= 0) throw new RefundRuleError(422, "BUSINESS_RULE_VIOLATION", "Voucher purchase audit is missing", "REFUND_AUDIT_MISSING");

          const pointsRefunded = Math.abs(purchaseDelta);
          const updated = await tx.voucher.updateMany({
            where: { id: voucher.id, user_id: session.id, status: "ACTIVE", issued_via: "POINTS_EXCHANGE", OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
            data: { status: "REFUNDED" },
          });
          if (updated.count !== 1) throw new RefundRuleError(409, "CONFLICT", "Voucher refund state changed");
          await tx.user.update({ where: { id: session.id }, data: { points_balance: { increment: pointsRefunded } } });
          await tx.pointsLog.create({ data: { user_id: session.id, delta: pointsRefunded, reason: "voucher_refund", voucher_id: voucher.id, performed_by: null, order_id: null } });
          return { qr_token: voucher.qr_token, status: "REFUNDED" as const, points_refunded: pointsRefunded };
        }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
        return NextResponse.json({ data: result });
      } catch (error) {
        if (isSerializationConflict(error) && attempt < 2) continue;
        if (isSerializationConflict(error)) throw new RefundRuleError(409, "CONFLICT", "Voucher refund could not be serialized");
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof RefundRuleError) {
      return NextResponse.json({ error: error.message, code: error.code, ...(error.reason ? { details: { reason: error.reason } } : {}) }, { status: error.status });
    }
    console.error("[POST /api/profile/vouchers/refund]", { name: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
  return NextResponse.json({ error: "Voucher refund could not be serialized", code: "CONFLICT" }, { status: 409 });
}
