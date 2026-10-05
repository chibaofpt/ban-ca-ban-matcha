import { NextResponse } from "next/server";
import { RegistrationOtpSendSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/clientIp";
import { getRegistrationOtpConfig, sendRegistrationOtp } from "@/lib/auth/registrationOtp";
import { RegistrationOtpError, registrationOtpErrorResponse } from "@/lib/auth/registrationOtpError";

/** Read registration mode and the unexpired challenge bound to the current strict cookie. */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    return NextResponse.json({ data: await getRegistrationOtpConfig(req) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return registrationOtpErrorResponse(error); }
}

/** Send or resume one idempotent registration-only OTP request. */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const parsed = RegistrationOtpSendSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new RegistrationOtpError(400, "VALIDATION_ERROR", "INVALID_INPUT");
    return NextResponse.json({ data: await sendRegistrationOtp(req, parsed.data, getClientIp(req)) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return registrationOtpErrorResponse(error); }
}
