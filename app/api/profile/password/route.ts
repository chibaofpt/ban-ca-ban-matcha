import { NextResponse } from "next/server";
import { ChangePasswordSchema } from "@/lib/validations/auth";
import { getSession, setAuthCookies, signJwt } from "@/lib/auth";
import {
  changePassword,
  ChangePasswordConflictError,
  CurrentPasswordMismatchError,
  PasswordReuseError,
} from "@/lib/changePassword";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";

function validationError(message: string, field: string) {
  return NextResponse.json(
    { error: message, code: "VALIDATION_ERROR", details: { field } },
    { status: 400 },
  );
}

/** Changes the authenticated customer's password and rotates its auth cookies. */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Không có quyền truy cập", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  if (!session.session_id) {
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue?.path[0] === "string" ? issue.path[0] : "current_password";
    return validationError(issue?.message ?? "Dữ liệu không hợp lệ", field);
  }

  const limit = await checkRateLimits([
    { ruleName: "authMutationIp", identifier: getClientIp(request) },
    { ruleName: "passwordChangeAccount", identifier: session.id },
  ]);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu, vui lòng thử lại sau.", code: "TOO_MANY_REQUESTS" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let rotation: Awaited<ReturnType<typeof changePassword>>;
  try {
    rotation = await changePassword({
      userId: session.id,
      sessionId: session.session_id,
      currentPassword: parsed.data.current_password,
      newPassword: parsed.data.new_password,
    });
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordMismatchError) {
      return validationError("Mật khẩu hiện tại không đúng", "current_password");
    }
    if (error instanceof PasswordReuseError) {
      return validationError("Mật khẩu mới phải khác mật khẩu hiện tại", "new_password");
    }
    if (error instanceof ChangePasswordConflictError) {
      return NextResponse.json(
        { error: "Mật khẩu vừa được thay đổi, vui lòng thử lại.", code: "CONFLICT" },
        { status: 409 },
      );
    }
    console.error("Password change temporarily unavailable");
    return NextResponse.json(
      { error: "Không thể đổi mật khẩu lúc này", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  try {
    const accessToken = await signJwt({
      id: session.id,
      role: session.role,
      phone_number: session.phone_number,
      sid: session.session_id,
    });
    await setAuthCookies(accessToken, rotation.refreshToken, session.role);
    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch {
    console.error("Password session renewal temporarily unavailable");
    return NextResponse.json(
      { error: "Không thể hoàn tất phiên đăng nhập", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
