import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { AccountError } from "@/lib/auth/accountError";
import { checkRateLimits, getClientIp } from "@/lib/rateLimit";
/** Apply the shared IP mutation limit to account proof endpoints. */
export async function accountMutationLimit(request: Request) {
  const limit = await checkRateLimits([{ ruleName: "authMutationIp", identifier: getClientIp(request) }]);
  return limit.allowed ? null : NextResponse.json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau.", code: "TOO_MANY_REQUESTS" },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } });
}
/** Require a current customer session before authenticated account operations. */
export async function accountCustomerSession() {
  const session = await getSession();
  if (!session?.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  if (session.role !== "CUSTOMER") throw new AccountError("ACCOUNT_NOT_ACTIVE", 403, "FORBIDDEN");
  return session;
}
