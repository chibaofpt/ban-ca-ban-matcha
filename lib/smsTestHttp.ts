import { NextResponse } from "next/server";
import { getSession, type AuthSession } from "@/lib/auth";
import { AbenlaConfigError, AbenlaResponseError } from "@/lib/sms/abenla";
import { SmsTestError } from "@/lib/smsTest";
import { smsTestEnabled } from "@/lib/smsTestGate";
import { SmsTestStoreUnavailable } from "@/lib/smsTestStore";

function json(body: object, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Respond with a sanitized SMS test API error and no cache. */
export function smsTestErrorResponse(error: unknown): NextResponse {
  if (error instanceof SmsTestError) {
    return json({ error: error.message, code: error.code, details: {
      reason: error.reason,
      ...(error.providerCode === undefined ? {} : { provider_code: error.providerCode }),
    } }, error.status);
  }
  if (error instanceof SmsTestStoreUnavailable || error instanceof AbenlaConfigError) {
    return json({ error: "SMS test unavailable", code: "BUSINESS_RULE_VIOLATION", details: { reason: "SMS_TEST_UNAVAILABLE" } }, 503);
  }
  if (error instanceof AbenlaResponseError) {
    return json({ error: "SMS provider unavailable", code: "BUSINESS_RULE_VIOLATION", details: { reason: "SMS_PROVIDER_UNAVAILABLE" } }, 502);
  }
  return json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
}

/** Gate every route locally and acquire an authoritative ADMIN session. */
export async function withSmsTestAdmin(
  work: (session: AuthSession & { session_id: string }) => Promise<object>,
): Promise<NextResponse> {
  if (!smsTestEnabled()) return json({ error: "Not found", code: "NOT_FOUND" }, 404);
  try {
    const session = await getSession();
    if (!session) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    if (session.role !== "ADMIN") return json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    if (!session.session_id) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    return json({ data: await work(session as AuthSession & { session_id: string }) }, 200);
  } catch (error) {
    return smsTestErrorResponse(error);
  }
}
