import { NextResponse } from "next/server";

/** A sanitized registration OTP failure with an optional authoritative retry instant. */
export class RegistrationOtpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly reason: string,
    readonly retryAt?: number,
    readonly providerCode?: number,
  ) { super(reason); }
}

/** Map OTP failures without exposing credentials, phone numbers or upstream messages. */
export function registrationOtpErrorResponse(error: unknown): NextResponse {
  const failure = error instanceof RegistrationOtpError ? error
    : new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_UNAVAILABLE");
  return NextResponse.json({
    error: failure.message, code: failure.code, details: {
      reason: failure.reason,
      ...(failure.retryAt === undefined ? {} : { retry_at: new Date(failure.retryAt).toISOString() }),
      ...(failure.providerCode === undefined ? {} : { provider_code: failure.providerCode }),
    },
  }, {
    status: failure.status,
    headers: {
      "Cache-Control": "no-store",
      ...(failure.retryAt === undefined ? {} : {
        "Retry-After": String(Math.max(1, Math.ceil((failure.retryAt - Date.now()) / 1000))),
      }),
    },
  });
}
