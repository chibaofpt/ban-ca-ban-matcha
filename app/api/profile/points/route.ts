/**
 * GET /api/profile/points — Current user's points balance + recent history.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { groupPointsHistory } from "@/lib/pointsHistory";
import { pointsHistoryQuerySchema } from "@/lib/validations/points";

export const dynamic = "force-dynamic";

function decodeCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/** GET /api/profile/points — Returns balance and grouped customer point events. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = pointsHistoryQuerySchema.safeParse({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    cursor: searchParams.get("cursor") ?? undefined,
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

  const { page, limit, cursor } = parsed.data;
  const cursorId = cursor ? decodeCursor(cursor) : null;
  if (cursor && !cursorId) {
    return NextResponse.json(
      { error: "Invalid pagination cursor", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  try {
    const [user, fetchedLogs, total] = await prisma.$transaction([
      prisma.user.findUnique({
        where: { id: session.id },
        select: { points_balance: true },
      }),
      prisma.pointsLog.findMany({
        where: { user_id: session.id },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursorId
          ? { cursor: { id: cursorId }, skip: 1 }
          : { skip: (page - 1) * limit }),
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
      prisma.pointsLog.count({ where: { user_id: session.id } }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const hasMore = fetchedLogs.length > limit;
    const logs = fetchedLogs.slice(0, limit);
    const history = groupPointsHistory(logs, 1, limit);
    const nextCursor = hasMore && logs.length > 0
      ? encodeCursor(logs[logs.length - 1].id)
      : null;

    return NextResponse.json({
      data: {
        points_balance: user.points_balance,
        events: history.events,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          has_more: hasMore,
          next_cursor: nextCursor,
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
