import { withSmsTestAdmin } from "@/lib/sms/smsTestHttp";
import { smsTestBalance } from "@/lib/sms/smsTest";

/** Read SMS provider balance for an authorized staging admin. */
export async function POST(): Promise<Response> {
  return withSmsTestAdmin((session) => smsTestBalance(session.id, session.session_id));
}
