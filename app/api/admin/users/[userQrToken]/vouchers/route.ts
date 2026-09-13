import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { captureServerException } from "@/lib/observability";
import { listAdminUserVouchers } from "@/lib/adminUserQueries";
import { adminUserPageQuerySchema } from "@/lib/validations/adminUser";

/** Lists one CUSTOMER voucher wallet for Admin inspection. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userQrToken: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const { userQrToken } = await params;
  if (!z.string().uuid().safeParse(userQrToken).success) return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
  const parsed = adminUserPageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const result = await listAdminUserVouchers(userQrToken, parsed.data.page);
    return result ? NextResponse.json({ data: result }) : NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
  } catch (error) {
    captureServerException(error, { operation: "list_admin_user_vouchers" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
