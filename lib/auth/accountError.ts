import { NextResponse } from "next/server";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
import { RegistrationOtpError, registrationOtpErrorResponse } from "@/lib/auth/registrationOtpError";
/** A public account workflow rejection with no identity or credential details. */
export class AccountError extends Error {
  constructor(public readonly reason: string, public readonly status = 409, public readonly code = "CONFLICT") { super(reason); }
}
/** Map known account failures without returning database or provider internals. */
export function accountErrorResponse(error: unknown): NextResponse {
  const response = error instanceof RegistrationOtpError ? registrationOtpErrorResponse(error)
    : error instanceof AccountError ? NextResponse.json({ error: "Không thể hoàn tất yêu cầu tài khoản", code: error.code, details: { reason: error.reason } }, { status: error.status })
    : isUniqueConstraintError(error) ? NextResponse.json({ error: "Thông tin tài khoản đã được sử dụng", code: "CONFLICT" }, { status: 409 })
    : NextResponse.json({ error: "Không thể hoàn tất yêu cầu lúc này", code: "INTERNAL_ERROR" }, { status: 500 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
