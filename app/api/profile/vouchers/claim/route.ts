import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  issueVoucher,
  VoucherIssuanceError,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

export const dynamic = "force-dynamic";

const claimSchema = z.object({ package_id: z.string().uuid() });

/** POST /api/profile/vouchers/claim — Claim one FREE_CLAIM voucher idempotently. */
export async function POST(req: NextRequest) {
  const parsed = claimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  const rateLimit = await checkRateLimit("voucherExchangeAccount", session.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const voucher = await issueVoucher(prisma as unknown as VoucherIssuanceDatabase, {
      user_id: session.id,
      package_id: parsed.data.package_id,
      source: "FREE_CLAIM",
    });

    if ("already_granted" in voucher) {
      const existing = await prisma.voucher.findFirst({
        where: { user_id: session.id, package_id: parsed.data.package_id },
        select: { qr_token: true, voucher_type: true, status: true, expires_at: true },
        orderBy: { created_at: "desc" },
      });
      if (!existing) throw new Error("Granted voucher could not be resolved");
      return NextResponse.json({
        data: {
          ...existing,
          already_granted: true,
        },
      });
    }

    return NextResponse.json({
      data: {
        qr_token: voucher.qr_token,
        voucher_type: voucher.voucher_type,
        status: voucher.status,
        expires_at: voucher.expires_at,
        already_granted: false,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof VoucherIssuanceError) {
      const status = error.reason === "NOT_FOUND" ? 404 : error.reason.includes("ALREADY") ? 409 : 422;
      return NextResponse.json({ error: error.message, code: error.reason }, { status });
    }
    console.error("[POST /api/profile/vouchers/claim]", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
