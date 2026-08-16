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

const exchangeSchema = z.object({ package_id: z.string().uuid() });

function issuanceErrorResponse(error: VoucherIssuanceError): NextResponse {
  const status = error.reason === "NOT_FOUND" ? 404 : error.reason === "CONFLICT" ? 409 : 422;
  return NextResponse.json({ error: error.message, code: error.reason }, { status });
}

/** POST /api/profile/vouchers/exchange — Redeem points for one points-only package. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
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
      source: "POINTS_EXCHANGE",
    });
    if ("already_granted" in voucher) {
      throw new VoucherIssuanceError("CONFLICT", "Voucher was already issued");
    }
    return NextResponse.json(
      {
        data: {
          qr_token: voucher.qr_token,
          voucher_type: voucher.voucher_type,
          status: voucher.status,
          expires_at: voucher.expires_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof VoucherIssuanceError) return issuanceErrorResponse(error);
    console.error("[POST /api/profile/vouchers/exchange]", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
