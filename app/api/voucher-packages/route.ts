/**
 * GET /api/voucher-packages — Public route, no auth required.
 * Returns all VoucherPackage rows with is_active = true,
 * ordered by created_at asc (oldest first for stable listing).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

    const session = await getSession();

    if (!session) {
      return NextResponse.json({
        data: packages.map((pkg) => ({ ...pkg, user_redeemed_count: 0 })),
      });
    }

    const packageIds = packages.map((p) => p.id);
    const redeemedCounts = await prisma.voucher.groupBy({
      by: ["package_id"],
      where: {
        package_id: { in: packageIds },
        user_id: session.id,
      },
      _count: { id: true },
    });

    const countMap = Object.fromEntries(
      redeemedCounts.map((rc) => [rc.package_id, rc._count.id])
    );

    const enrichedPackages = packages.map((pkg) => ({
      ...pkg,
      user_redeemed_count: countMap[pkg.id] ?? 0,
    }));

    return NextResponse.json({ data: enrichedPackages });
  } catch (err) {
    console.error("[GET /api/voucher-packages]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
