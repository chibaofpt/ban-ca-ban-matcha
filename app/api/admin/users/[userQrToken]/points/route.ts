import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { captureServerException } from "@/lib/observability";
import { AdminUserWorkflowError, giftAdminUserPoints } from "@/lib/adminUserWorkflow";
import { adminUserPointsSchema } from "@/lib/validations/adminUser";

/** Gifts an audited, atomic points adjustment to one CUSTOMER. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ userQrToken: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const { userQrToken } = await params;
  if (!z.string().uuid().safeParse(userQrToken).success) return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
  const parsed = adminUserPointsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const pointsBalance = await giftAdminUserPoints(userQrToken, parsed.data.points, session.id);
    return NextResponse.json({ data: { points_balance: pointsBalance } });
  } catch (error) {
    if (error instanceof AdminUserWorkflowError) {
      const status = error.reason === "NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: error.message, code: error.reason }, { status });
    }
    captureServerException(error, { operation: "gift_admin_user_points" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
