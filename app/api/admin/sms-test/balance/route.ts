import { withSmsTestAdmin } from "@/lib/smsTestHttp";
import { smsTestBalance } from "@/lib/smsTest";

/** Read SMS provider balance for an authorized staging admin. */
export async function POST(): Promise<Response> {
  return withSmsTestAdmin((session) => smsTestBalance(session.id, session.session_id));
}
