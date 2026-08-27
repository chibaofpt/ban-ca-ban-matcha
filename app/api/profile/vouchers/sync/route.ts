import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { prisma } from "@/lib/prisma";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

export const dynamic = "force-dynamic";

/** POST /api/profile/vouchers/sync — Explicitly reconcile automatic grants and expirations. */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const granted = await ensureAutoGrantedVouchers(
      prisma as unknown as VoucherIssuanceDatabase,
      session.id,
    );
    const expired_count = await lazyExpireVouchers(session.id);
    return NextResponse.json({ data: { granted_count: granted.granted, expired_count } });
  } catch (err) {
    console.error("[POST /api/profile/vouchers/sync]", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
