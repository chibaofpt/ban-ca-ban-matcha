import { withSmsTestAdmin } from "@/lib/sms/smsTestHttp";
import { smsTestConnection } from "@/lib/sms/smsTest";

/** Check SMS provider connectivity for an authorized staging admin. */
export async function POST(): Promise<Response> {
  return withSmsTestAdmin((session) => smsTestConnection(session.id, session.session_id));
}
