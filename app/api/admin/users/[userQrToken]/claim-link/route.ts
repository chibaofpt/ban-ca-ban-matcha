import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { issueClaimLink } from "@/lib/auth/accountClaim";
import { AccountError, accountErrorResponse } from "@/lib/auth/accountError";
import { accountMutationLimit } from "@/lib/auth/accountHttp";
/** Issue a private, short-lived claim fragment for an eligible legacy customer. */
export async function POST(request: Request, context: { params: Promise<{ userQrToken: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
    if (session.role !== "ADMIN") throw new AccountError("ACCOUNT_NOT_ACTIVE", 403, "FORBIDDEN");
    const limited = await accountMutationLimit(request);
    if (limited) return limited;
    const { userQrToken } = await context.params;
    return NextResponse.json({ data: await issueClaimLink(request, userQrToken, session.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
