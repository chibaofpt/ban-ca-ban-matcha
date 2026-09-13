import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { captureServerException } from "@/lib/observability";
import { getAdminUserOrder } from "@/lib/adminUserQueries";

/** Returns one order only when it belongs to the selected CUSTOMER. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userQrToken: string; orderId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const { userQrToken, orderId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(userQrToken).success || !uuid.safeParse(orderId).success) return NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
  try {
    const order = await getAdminUserOrder(userQrToken, orderId);
    return order ? NextResponse.json({ data: order }) : NextResponse.json({ error: "Order not found", code: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    captureServerException(error, { operation: "get_admin_user_order" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
