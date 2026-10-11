import { NextResponse } from "next/server";
import { PhoneOtpRequestSchema } from "@/lib/validations/account";
import { sendPhoneClaimOtp } from "@/lib/auth/accountPhone";
import { accountErrorResponse } from "@/lib/auth/accountError";
import { accountCustomerSession, accountMutationLimit } from "@/lib/auth/accountHttp";
import { getClientIp } from "@/lib/rateLimit";

/** Apply the authenticated contact-phone operation with its own ownership proof. */
export async function POST(request: Request) {
  try {
    const session = await accountCustomerSession();
    const parsed = PhoneOtpRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", code: "VALIDATION_ERROR" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const limited = await accountMutationLimit(request);
    if (limited) return limited;
    return NextResponse.json({ data: await sendPhoneClaimOtp(request, session, parsed.data, getClientIp(request)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) { return accountErrorResponse(error); }
}
