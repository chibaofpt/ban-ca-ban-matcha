import { NextResponse } from "next/server";
import { GoogleChallengeSchema } from "@/lib/validations/account";
import { createGoogleChallenge } from "@/lib/auth/googleChallenge";
import { accountErrorResponse } from "@/lib/auth/accountError";
import { accountMutationLimit } from "@/lib/auth/accountHttp";
import { getClientIp } from "@/lib/rateLimit";

/** Validate the account proof request and execute its bound account workflow. */
export async function POST(request: Request) {
  const parsed = GoogleChallengeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const limited = await accountMutationLimit(request);
    if (limited) return limited;
    return NextResponse.json({ data: await createGoogleChallenge(request, parsed.data, getClientIp(request)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
