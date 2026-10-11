import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import type { GoogleChallengePayload } from "@/contracts/account";
import { getSession, type AuthSession } from "@/lib/auth";
import { accountDigest, accountBrowserBinding, claimContextHash } from "@/lib/auth/accountCookies";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { loadAccount, requireActiveAccount } from "@/lib/auth/accountData";
import { loadClaim } from "@/lib/auth/accountClaim";
import { AccountError } from "@/lib/auth/accountError";
import { prisma } from "@/lib/prisma";
import { verifyAccountTurnstile } from "@/lib/auth/turnstile";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { prepareGoogleLogin } from "@/lib/auth/googleLoginPreparation";
const DUMMY_HASH = "$2a$12$R9h/cIPz0gi.URNNX3rub2A9WEH71/x7LpZ9zL1Pz.x0bI/tXh9eW";
/** Recheck the actor's live session inside every sensitive account transaction. */
export async function requireActorSession(tx: Pick<Prisma.TransactionClient, "session">, actorId: string, sessionId: string): Promise<void> {
  const session = await tx.session.findFirst({ where: { id: sessionId, user_id: actorId, expires_at: { gt: new Date() } }, select: { id: true } });
  if (!session) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
}
/** Prepare LOGIN immediately, or create a legacy purpose-bound challenge after CAPTCHA checks. */
export async function createGoogleChallenge(req: Request, input: GoogleChallengePayload, ip: string) {
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()) throw new AccountError("GOOGLE_CONFIG", 503, "SERVICE_UNAVAILABLE");
  if (input.purpose === "LOGIN" && input.turnstile_token === undefined) return prepareGoogleLogin(req);
  if (!input.turnstile_token) throw new AccountError("TURNSTILE_REQUIRED", 400, "VALIDATION_ERROR");
  await verifyAccountTurnstile(input.turnstile_token, ip, "google_auth");
  let actor: AuthSession | null = await getSession();
  let expectedHash: string | null = null;
  if (input.purpose === "LINK" || input.purpose === "REAUTH") {
    if (!actor || actor.role !== "CUSTOMER" || !actor.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
    const user = await loadAccount(prisma, actor.id); requireActiveAccount(user);
    if (input.purpose === "LINK") {
      const valid = await bcrypt.compare(input.current_password ?? "", user.password_hash ?? DUMMY_HASH);
      if (!valid || !user.password_hash || user.password_hash === "GHOST_USER_NO_PASSWORD" || user.account_origin !== "LEGACY_PHONE" || user.google_sub) throw new AccountError("CURRENT_PASSWORD_INVALID", 400, "VALIDATION_ERROR");
      expectedHash = user.password_hash;
    } else if (!user.google_sub) throw new AccountError("GOOGLE_NOT_CONNECTED");
  } else if (input.purpose === "LOGIN") actor = null;
  const binding = await accountBrowserBinding(req, true);
  const claimHash = input.purpose === "CLAIM" ? await claimContextHash() : null;
  const nonce = randomBytes(32).toString("hex"); const expires = new Date(Date.now() + 300000);
  const row = await accountTransaction(async tx => {
    if (actor) {
      if (!actor.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
      await requireActorSession(tx, actor.id, actor.session_id); await claimActiveCustomerForWrite(tx, actor.id);
      const current = await loadAccount(tx, actor.id); requireActiveAccount(current);
      if (expectedHash !== null && current.password_hash !== expectedHash) throw new AccountError("CURRENT_PASSWORD_CHANGED");
    }
    const claim = claimHash ? await loadClaim(tx, claimHash) : null;
    return tx.googleAuthAttempt.create({ data: { purpose: input.purpose, nonce_hash: accountDigest(nonce), binding_hash: binding,
      actor_user_id: actor?.id ?? null, actor_session_id: actor?.session_id ?? null,
      claim_link_id: claim?.id ?? null, claim_token_hash: claimHash, expires_at: expires } });
  });
  return { challenge_id: row.id, nonce, expires_at: expires.toISOString() };
}
