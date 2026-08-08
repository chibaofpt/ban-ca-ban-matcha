/**
 * GET /api/profile/vouchers — List all vouchers belonging to the current user.
 * Returns all statuses (ACTIVE, RESERVED, REDEEMED, EXPIRED, REFUNDED)
 * ordered by created_at desc, newest first.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";

export const dynamic = "force-dynamic";

/** GET /api/profile/vouchers — Returns all vouchers belonging to the current user. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // Lazy-sync: mark expired vouchers before listing
    await lazyExpireVouchers(session.id);

    const vouchers = await prisma.voucher.findMany({
      where: { user_id: session.id },
      orderBy: { created_at: "desc" },
      include: {
        package: { select: { name: true, description: true, points_cost: true } },
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
        // Staff who redeemed it offline (null = redeemed by the user themselves online)
        staff: { select: { name: true, role: true } },
      },
    });

    return NextResponse.json({ data: vouchers.map(toPublicVoucherDto) });
  } catch (err) {
    console.error("[GET /api/profile/vouchers]", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
