import type { Prisma } from "@prisma/client";
import { accountDigest, accountBrowserBinding } from "@/lib/auth/accountCookies";
import { AccountError } from "@/lib/auth/accountError";
import { requireActorSession } from "@/lib/auth/googleChallenge";
/** Consume one fresh Google reauthentication ticket for the same browser, actor and session. */
export async function consumeGoogleReauth(tx: Prisma.TransactionClient, req: Request, proof: string | undefined, userId: string, sessionId: string, googleSub: string | null): Promise<void> {
  if (!proof || !googleSub || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(proof)) throw new AccountError("GOOGLE_REAUTH_REQUIRED", 400, "VALIDATION_ERROR");
  const [id, raw] = proof.split(".");
  const binding = await accountBrowserBinding(req);
  await requireActorSession(tx, userId, sessionId);
  const consumed = await tx.googleAuthAttempt.updateMany({ where: { id, purpose: "REAUTH", binding_hash: binding,
    actor_user_id: userId, actor_session_id: sessionId, nonce_hash: accountDigest(raw), verified_google_sub: googleSub,
    verified_at: { not: null, gt: new Date(Date.now() - 300000) }, consumed_at: null, expires_at: { gt: new Date() } }, data: { consumed_at: new Date() } });
  if (consumed.count !== 1) throw new AccountError("GOOGLE_REAUTH_REQUIRED", 400, "VALIDATION_ERROR");
}