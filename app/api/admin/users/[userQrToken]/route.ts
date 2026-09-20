import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AdminUserMutationResult, AdminUserPasswordResetResult } from "@/contracts/admin/user";

import { getSession } from "@/lib/auth";
import { captureServerException } from "@/lib/observability";
import { getAdminUser } from "@/lib/adminUserQueries";
import {
  AdminUserWorkflowError, resetAdminUserPassword, setAdminUserBlocked, setAdminUserVerified,
} from "@/lib/adminUserWorkflow";
import { adminUserPatchSchema } from "@/lib/validations/adminUser";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ userQrToken: string }> };

async function authorize() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  return null;
}

function notFound() {
  return NextResponse.json({ error: "Customer not found", code: "NOT_FOUND" }, { status: 404 });
}

/** Returns one CUSTOMER summary selected by public QR token. */
export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;
  const { userQrToken } = await params;
  if (!z.string().uuid().safeParse(userQrToken).success) return notFound();
  try {
    const user = await getAdminUser(userQrToken);
    return user ? NextResponse.json({ data: user }) : notFound();
  } catch (error) {
    captureServerException(error, { operation: "get_admin_user" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/** Applies one strict Admin account action to a CUSTOMER. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;
  const { userQrToken } = await params;
  if (!z.string().uuid().safeParse(userQrToken).success) return notFound();
  const parsed = adminUserPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    if (parsed.data.action === "verify") await setAdminUserVerified(userQrToken, parsed.data.is_verified);
    if (parsed.data.action === "block") await setAdminUserBlocked(userQrToken, parsed.data.is_blocked);
    if (parsed.data.action === "reset_password") {
      const temporaryPassword = await resetAdminUserPassword(userQrToken);
      const data = {
        success: true,
        temporary_password: temporaryPassword,
      } satisfies AdminUserPasswordResetResult;
      return NextResponse.json({ data });
    }
    const data = { success: true } satisfies AdminUserMutationResult;
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AdminUserWorkflowError && error.reason === "NOT_FOUND") return notFound();
    if (error instanceof AdminUserWorkflowError && error.reason === "RESET_NOT_ALLOWED") {
      return NextResponse.json({
        error: "Password reset is not available for an unregistered customer",
        code: "CONFLICT",
        details: { reason: "RESET_NOT_ALLOWED" },
      }, { status: 409 });
    }
    captureServerException(error, { operation: "update_admin_user" });
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
