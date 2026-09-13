import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { captureServerException } from "@/lib/observability";
import { listAdminUserVoucherPackages } from "@/lib/adminUserQueries";
import { adminUserVoucherPackageQuerySchema } from "@/lib/validations/adminUser";

/** Lists active voucher packages for the Admin customer gift picker. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  const parsed = adminUserVoucherPackageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    return NextResponse.json({ data: await listAdminUserVoucherPackages(parsed.data.page, parsed.data.category) });
  } catch (error) {
    captureServerException(error, { operation: "list_admin_user_voucher_packages" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
