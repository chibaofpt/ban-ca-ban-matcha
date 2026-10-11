import { NextResponse } from "next/server";
import { GoogleCredentialSchema } from "@/lib/validations/account";
import { authenticateGoogle } from "@/lib/auth/googleAuth";
import { accountErrorResponse } from "@/lib/auth/accountError";
import { accountMutationLimit } from "@/lib/auth/accountHttp";
import { publishAccountSession } from "@/lib/auth/accountSession";

/** Validate the account proof request and execute its bound account workflow. */
export async function POST(request: Request) {
  const parsed = GoogleCredentialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const limited = await accountMutationLimit(request);
    if (limited) return limited;
    const result = await authenticateGoogle(request, parsed.data);
    return NextResponse.json({ data: ("reauth_proof" in result ? result : await publishAccountSession(result)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
