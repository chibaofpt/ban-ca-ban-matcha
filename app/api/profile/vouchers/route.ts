/**
 * GET /api/profile/vouchers — List own ACTIVE vouchers
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/profile/vouchers — Returns all ACTIVE vouchers belonging to the current user. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const vouchers = await prisma.voucher.findMany({
      where: { user_id: session.id, status: "ACTIVE" },
      orderBy: { created_at: "desc" },
      include: {
        package: { select: { name: true, description: true, points_cost: true } },
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
      },
    });

    return NextResponse.json({ data: vouchers });
  } catch (err) {
    console.error("[GET /api/profile/vouchers]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
