/**
 * GET /api/staff/users/[id]/vouchers — List ACTIVE vouchers of a customer.
 * Auth: STAFF or ADMIN only.
 * Returns empty array for unknown user_id (no 404 — prevents info leak).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/staff/users/[id]/vouchers — Returns all ACTIVE vouchers for the given customer. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id: userId } = await params;

  try {
    const vouchers = await prisma.voucher.findMany({
      where: {
        user_id: userId,
        status: "ACTIVE",
      },
      orderBy: { created_at: "desc" },
      include: {
        package: { select: { name: true, description: true, points_cost: true } },
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
        staff: { select: { name: true, role: true } },
      },
    });

    return NextResponse.json({ data: vouchers });
  } catch (err) {
    console.error("[GET /api/staff/users/[id]/vouchers]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
