/**
 * GET /api/profile/points — Current user's points balance + recent history.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { groupPointsHistory } from "@/lib/pointsHistory";
import { pointsHistoryQuerySchema } from "@/lib/validations/points";

export const dynamic = "force-dynamic";

/** GET /api/profile/points — Returns balance and grouped customer point events. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = pointsHistoryQuerySchema.safeParse({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pagination", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { page, limit } = parsed.data;

  try {
    const [user, logs] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: session.id },
        select: { points_balance: true },
      }),
      prisma.pointsLog.findMany({
        where: { user_id: session.id },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          delta: true,
          reason: true,
          order_id: true,
          created_at: true,
          order: { select: { total_vnd: true, order_code: true } },
          voucher: {
            select: { package: { select: { name: true } } },
          },
          staff: { select: { name: true, role: true } },
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const history = groupPointsHistory(logs, page, limit);

    return NextResponse.json({
      data: {
        points_balance: user.points_balance,
        ...history,
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
