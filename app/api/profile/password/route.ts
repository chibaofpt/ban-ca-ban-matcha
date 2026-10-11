import { NextResponse } from "next/server";
import { ChangePasswordSchema } from "@/lib/validations/auth";
import { getSession, setAuthCookies, signJwt } from "@/lib/auth";
import { changePassword, ChangePasswordConflictError, CurrentPasswordMismatchError, PasswordReuseError } from "@/lib/auth/changePassword";
import { AccountError, accountErrorResponse } from "@/lib/auth/accountError";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
function validationError(message: string, field: string) {
  return NextResponse.json({ error: message, code: "VALIDATION_ERROR", details: { field } }, { status: 400 });
}
/** Change or create the customer's legacy password and renew its current session cookies. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.session_id) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" }, { status: 401 });
  if (session.role !== "CUSTOMER") return NextResponse.json({ error: "Không có quyền truy cập", code: "FORBIDDEN" }, { status: 403 });
  const parsed = ChangePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return validationError(issue?.message ?? "Dữ liệu không hợp lệ", typeof issue?.path[0] === "string" ? issue.path[0] : "current_password");
  }
  const limit = await checkRateLimits([{ ruleName: "authMutationIp", identifier: getClientIp(request) }, { ruleName: "passwordChangeAccount", identifier: session.id }]);
  if (!limit.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau.", code: "TOO_MANY_REQUESTS" },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  try {
    const rotation = await changePassword({ userId: session.id, sessionId: session.session_id, currentPassword: parsed.data.current_password,
      newPassword: parsed.data.new_password, request, reauthProof: parsed.data.reauth_proof });
    await setAuthCookies(await signJwt({ id: session.id, role: session.role, phone_number: session.phone_number, sid: session.session_id }), rotation.refreshToken, session.role);
    return NextResponse.json({ data: { success: true } });
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordMismatchError) return validationError("Mật khẩu hiện tại không đúng", "current_password");
    if (error instanceof PasswordReuseError) return validationError("Mật khẩu mới phải khác mật khẩu hiện tại", "new_password");
    if (error instanceof ChangePasswordConflictError) return NextResponse.json({ error: "Mật khẩu vừa được thay đổi, vui lòng thử lại.", code: "CONFLICT" }, { status: 409 });
    if (error instanceof AccountError) return accountErrorResponse(error);
    return NextResponse.json({ error: "Không thể đổi mật khẩu lúc này", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
