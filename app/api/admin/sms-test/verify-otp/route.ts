import type { NextRequest } from "next/server";
import { withSmsTestAdmin } from "@/lib/smsTestHttp";
import { smsTestVerifyOtp, SmsTestError } from "@/lib/smsTest";
import { smsTestVerifySchema } from "@/lib/validations/smsTest";

/** Verify a staging SMS challenge for the initiating admin session. */
export async function POST(request: NextRequest): Promise<Response> {
  return withSmsTestAdmin(async (session) => {
    const parsed = smsTestVerifySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new SmsTestError(400, "VALIDATION_ERROR", "INVALID_REQUEST");
    return smsTestVerifyOtp(session.id, session.session_id, parsed.data);
  });
}
