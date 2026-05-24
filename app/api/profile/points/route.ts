/**
 * GET /api/profile/points — Current user's points balance + recent history.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/profile/points — Returns points_balance and last 20 points_log entries. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  try {
    const [user, total, logs] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: session.id },
        select: { points_balance: true },
      }),
      prisma.pointsLog.count({ where: { user_id: session.id } }),
      prisma.pointsLog.findMany({
        where: { user_id: session.id },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          delta: true,
          reason: true,
          order_id: true,
          voucher_id: true,
          created_at: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        points_balance: user.points_balance,
        logs,
        meta: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/profile/points]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
