import type { NextRequest } from "next/server";
import { withSmsTestAdmin } from "@/lib/smsTestHttp";
import { smsTestSendOtp, SmsTestError } from "@/lib/smsTest";
import { smsTestSendSchema } from "@/lib/validations/smsTest";

/** Create and dispatch one rate-limited staging SMS challenge. */
export async function POST(request: NextRequest): Promise<Response> {
  return withSmsTestAdmin(async (session) => {
    const parsed = smsTestSendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const hasTemplateError = parsed.error.issues.some((issue) => issue.path[0] === "message_template");
      throw new SmsTestError(400, "VALIDATION_ERROR", hasTemplateError ? "INVALID_MESSAGE_TEMPLATE" : "INVALID_REQUEST");
    }
    return smsTestSendOtp(session.id, session.session_id, parsed.data);
  });
}
