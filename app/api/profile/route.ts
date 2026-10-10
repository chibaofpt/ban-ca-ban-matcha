import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { UpdateProfileSchema } from "@/lib/validations/profile";
import { getAccountProfile, updateAccountProfile } from "@/lib/auth/accountProfile";
import { AccountError, accountErrorResponse } from "@/lib/auth/accountError";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
async function customerSession() {
  const session = await getSession();
  if (!session) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  if (session.role !== "CUSTOMER") throw new AccountError("ACCOUNT_NOT_ACTIVE", 403, "FORBIDDEN");
  return session;
}
/** Return the authenticated customer's public profile and account capabilities. */
export async function GET() {
  try {
    const session = await customerSession();
    return NextResponse.json({ data: await getAccountProfile(session.id) });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
/** Update the customer's profile using password or fresh Google proof for Instagram. */
export async function PATCH(request: Request) {
  const parsed = UpdateProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const session = await customerSession();
    return NextResponse.json({ data: await updateAccountProfile(request, session, parsed.data) });
  } catch (error: unknown) {
    if (isUniqueConstraintError(error)) return NextResponse.json({ error: "Tên Instagram này đã được sử dụng", code: "CONFLICT", details: { field: "insta_name" } }, { status: 409 });
    if (error instanceof AccountError && error.reason.startsWith("CURRENT_PASSWORD")) return NextResponse.json({ error: error.reason === "CURRENT_PASSWORD_REQUIRED" ? "Vui lòng nhập mật khẩu hiện tại để đổi Instagram" : "Mật khẩu hiện tại không đúng", code: "VALIDATION_ERROR", details: { field: "current_password" } }, { status: 400 });
    return accountErrorResponse(error);
  }
}
