/**
 * GET /api/voucher-packages — Public route, no auth required.
 * Returns all VoucherPackage rows with is_active = true,
 * ordered by created_at asc (oldest first for stable listing).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const packages = await prisma.voucherPackage.findMany({
      where: { is_active: true },
      orderBy: { created_at: "asc" },
      include: {
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
      },
    });

    return NextResponse.json({ data: packages });
  } catch (err) {
    console.error("[GET /api/voucher-packages]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
