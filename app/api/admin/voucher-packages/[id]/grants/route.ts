import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { invalidateVoucherCaches } from "@/lib/cacheInvalidation";
import {
  AdminVoucherGrantConfirmationRequiredError,
  grantVoucherWithWarning,
} from "@/lib/adminVoucherGrant";
import {
  VoucherIssuanceError,
  type IssuedVoucherResult,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  user_qr_token: z.string().uuid(),
  request_id: z.string().uuid(),
  acknowledge_additional_gift: z.boolean().optional().default(false),
}).strict();

function errorResponse(error: VoucherIssuanceError): NextResponse {
  const status = error.reason === "NOT_FOUND" ? 404 : error.reason === "CONFLICT" ? 409 : 422;
  return NextResponse.json({ error: error.message, code: error.reason }, { status });
}

function serializeVoucher(voucher: IssuedVoucherResult, now: Date, alreadyGranted: boolean) {
  const status = "status" in voucher && typeof voucher.status === "string" ? voucher.status : "ACTIVE";
  const expiresAt = "expires_at" in voucher && voucher.expires_at instanceof Date ? voucher.expires_at.toISOString() : null;
  const effectiveStatus = status === "ACTIVE" && expiresAt !== null && new Date(expiresAt) <= now ? "EXPIRED" : status;
  return {
    qr_token: "qr_token" in voucher && typeof voucher.qr_token === "string" ? voucher.qr_token : "",
    voucher_type: "voucher_type" in voucher && typeof voucher.voucher_type === "string" ? voucher.voucher_type : "",
    status,
    effective_status: effectiveStatus,
    expires_at: expiresAt,
    already_granted: alreadyGranted,
  };
}

/** Gives one package voucher to a CUSTOMER with durable admin request replay protection. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const { id: packageId } = await params;
  if (!z.string().uuid().safeParse(packageId).success) {
    return NextResponse.json({ error: "Voucher package not found", code: "NOT_FOUND" }, { status: 404 });
  }
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const recipient = await prisma.user.findUnique({
      where: { qr_token: parsed.data.user_qr_token },
      select: { id: true, role: true },
    });
    if (!recipient) return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
    if (recipient.role !== "CUSTOMER") {
      return NextResponse.json(
        { error: "Voucher gifts require a CUSTOMER recipient", code: "BUSINESS_RULE_VIOLATION", details: { reason: "RECIPIENT_NOT_CUSTOMER" } },
        { status: 422 },
      );
    }

    const now = new Date();

    const voucher = await grantVoucherWithWarning(prisma as unknown as VoucherIssuanceDatabase, {
      user_id: recipient.id,
      package_id: packageId,
      performed_by: session.id,
      request_id: parsed.data.request_id,
      now,
      acknowledge_additional_gift: parsed.data.acknowledge_additional_gift,
    });
    const replayed = "already_granted" in voucher && voucher.already_granted === true;
    await invalidateVoucherCaches();
    return NextResponse.json({ data: serializeVoucher(voucher, now, replayed) }, { status: replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof AdminVoucherGrantConfirmationRequiredError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "BUSINESS_RULE_VIOLATION",
          details: {
            reason: "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED",
            summary: { ...error.summary, expiry_preview: error.summary.expiry_preview?.toISOString() ?? null },
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof VoucherIssuanceError) return errorResponse(error);
    console.error("[POST /api/admin/voucher-packages/[id]/grants]", { name: error instanceof Error ? error.name : typeof error });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
