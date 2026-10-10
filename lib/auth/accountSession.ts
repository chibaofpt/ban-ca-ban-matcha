import type { Prisma } from "@prisma/client";
import { signJwt, setAuthCookies } from "@/lib/auth";
import { cacheDelete } from "@/lib/redis";
import type { AccountRecord } from "@/lib/auth/accountData";
import type { WelcomeRewardSummary } from "@/contracts/reward";
export interface AccountSessionResult { user: AccountRecord; session: { id: string; refresh_token: string }; evicted: string[]; welcome: WelcomeRewardSummary | null; }
/** Create a session with the shared seven-day lifetime and five-session customer cap. */
export async function createAccountSession(tx: Prisma.TransactionClient, user: AccountRecord, welcome: WelcomeRewardSummary | null = null): Promise<AccountSessionResult> {
  const active = await tx.session.findMany({ where: { user_id: user.id, expires_at: { gt: new Date() } }, orderBy: { created_at: "asc" },
    select: { id: true, refresh_token: true, previous_refresh_token: true } });
  const removed = active.slice(0, Math.max(0, active.length - 4));
  if (removed.length) await tx.session.deleteMany({ where: { id: { in: removed.map(row => row.id) } } });
  const session = await tx.session.create({ data: { user_id: user.id, expires_at: new Date(Date.now() + 7 * 86400000) } });
  return { user, session, welcome, evicted: removed.flatMap(row => [row.refresh_token, ...(row.previous_refresh_token ? [row.previous_refresh_token] : [])]) };
}
/** Revoke all sessions involved in a credential transfer in the same transaction. */
export async function revokeAccountSessions(tx: Prisma.TransactionClient, userIds: string[]): Promise<string[]> {
  const rows = await tx.session.findMany({ where: { user_id: { in: userIds } }, select: { refresh_token: true, previous_refresh_token: true } });
  await tx.session.deleteMany({ where: { user_id: { in: userIds } } });
  return rows.flatMap(row => [row.refresh_token, ...(row.previous_refresh_token ? [row.previous_refresh_token] : [])]);
}
/** Publish cookies only after the complete account transaction has committed. */
export async function publishAccountSession(result: AccountSessionResult) {
  await cacheDelete(...result.evicted.map(token => `session:${token}`)).catch(() => undefined);
  const user = result.user;
  await setAuthCookies(await signJwt({ id: user.id, role: user.role, phone_number: user.phone_number, sid: result.session.id }), result.session.refresh_token, user.role);
  return { qr_token: user.qr_token, name: user.name, phone_number: user.phone_number, email: user.email, insta_name: user.insta_name, role: user.role, welcome_reward: result.welcome };
}
