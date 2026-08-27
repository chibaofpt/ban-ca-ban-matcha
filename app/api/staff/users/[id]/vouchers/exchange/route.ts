/**
 * POST /api/staff/users/[id]/vouchers/exchange
 *
 * Spend a customer's points to purchase a voucher package on their behalf.
 * Requires STAFF or ADMIN role.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { resolveCustomerIdentifier } from "@/lib/publicIdentifiers";
import {
  issueVoucher,
  VoucherIssuanceError,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

export const dynamic = "force-dynamic";

const exchangeSchema = z.object({
  package_id: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // 1. Auth & Role check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // Allow ADMIN to exchange on behalf of customer.
  // The user requested: "ở trang tạo order với role là admin bạn sẽ cho admin đổi voucher dùm khách luôn"
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const { package_id } = parsed.data;
    const resolvedUser = await resolveCustomerIdentifier(id);
    if (!resolvedUser) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    const userId = resolvedUser.id;

    const voucher = await issueVoucher(prisma as unknown as VoucherIssuanceDatabase, {
      user_id: userId,
      package_id,
      source: "POINTS_EXCHANGE",
      performed_by: session.id,
    });

    return NextResponse.json(
      {
        data: {
          qr_token: "qr_token" in voucher ? voucher.qr_token : undefined,
          voucher_type: "voucher_type" in voucher ? voucher.voucher_type : undefined,
          status: "status" in voucher ? voucher.status : "ACTIVE",
          expires_at: "expires_at" in voucher ? voucher.expires_at : null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof VoucherIssuanceError) {
      if (err.reason === "VOUCHER_SOLD_OUT") {
        return NextResponse.json(
          { error: "This voucher package is sold out", code: "VOUCHER_SOLD_OUT" },
          { status: 422 }
        );
      }
      if (err.reason === "VOUCHER_LIMIT_REACHED") {
        return NextResponse.json(
          { error: "Customer has already redeemed the maximum allowed vouchers from this package", code: "VOUCHER_LIMIT_REACHED" },
          { status: 422 }
        );
      }
      if (err.reason === "INSUFFICIENT_POINTS") {
        return NextResponse.json(
          { error: "Insufficient points.", code: "INSUFFICIENT_POINTS" },
          { status: 422 }
        );
      }
      const status = err.reason === "NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: err.message, code: err.reason }, { status });
    }
    console.error("[POST /api/staff/users/[id]/vouchers/exchange]", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
