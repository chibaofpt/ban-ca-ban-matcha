import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  readVoucherExchangeRanking,
  type AdminVoucherExchangeRankingDatabase,
} from "@/lib/vouchers/adminVoucherRanking";

export const dynamic = "force-dynamic";

const querySchema = z.object({ period: z.enum(["year", "month", "week", "day"]) });

/**
 * GET /api/admin/voucher-packages/exchange-ranking — point-exchange voucher counts per package.
 * ADMIN only; `period` selects the current Vietnam calendar year, month, week or day.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid period", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const data = await readVoucherExchangeRanking(
      prisma as unknown as AdminVoucherExchangeRankingDatabase,
      parsed.data.period,
      new Date(),
    );
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[GET /api/admin/voucher-packages/exchange-ranking]", error);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
