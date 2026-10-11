import { randomBytes } from "node:crypto";
import type { Prisma, GoogleAuthAttempt } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { GoogleCredentialPayload } from "@/contracts/account";
import { accountBrowserBinding, accountDigest, claimContextHash, setClaimContext } from "@/lib/auth/accountCookies";
import { AccountError } from "@/lib/auth/accountError";
import { ACCOUNT_INCLUDE, loadAccount, requireActiveAccount, requireClaimableGhost, requireEmailGhost, type AccountRecord } from "@/lib/auth/accountData";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { createAccountSession } from "@/lib/auth/accountSession";
import { loadClaim } from "@/lib/auth/accountClaim";
import { requireActorSession } from "@/lib/auth/googleChallenge";
import { verifyGoogleIdentity, type GoogleIdentity } from "@/lib/auth/googleIdentity";
import { mergeAccounts } from "@/lib/auth/accountMerge";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { createWelcomeRewardInTransaction } from "@/lib/rewards/welcomeReward";
import { googleClaimActorHash, readGoogleLoginPreparation } from "@/lib/auth/googleLoginPreparation";
import { verifyAccountTurnstile } from "@/lib/auth/turnstile";
import { getClientIp } from "@/lib/clientIp";
import { isUniqueConstraintError } from "@/lib/prisma-errors";
async function findGoogleUser(tx: Prisma.TransactionClient, identity: GoogleIdentity) {
  return tx.user.findUnique({ where: { google_sub: identity.sub }, include: ACCOUNT_INCLUDE });
}
async function activateGhost(tx: Prisma.TransactionClient, user: AccountRecord, identity: GoogleIdentity) {
  await claimActiveCustomerForWrite(tx, user.id);
  const current = await loadAccount(tx, user.id);
  if (current.account_origin === "GOOGLE_EMAIL") requireEmailGhost(current);
  else requireClaimableGhost(current);
  await tx.user.update({ where: { id: user.id }, data: { google_sub: identity.sub, email: identity.email, is_verified: true } });
  const welcome = await createWelcomeRewardInTransaction(tx, user.id);
  return createAccountSession(tx, await loadAccount(tx, user.id), welcome);
}
async function loginGoogle(tx: Prisma.TransactionClient, identity: GoogleIdentity) {
  const existing = await findGoogleUser(tx, identity);
  if (existing) {
    await claimActiveCustomerForWrite(tx, existing.id); requireActiveAccount(await loadAccount(tx, existing.id));
    return createAccountSession(tx, await loadAccount(tx, existing.id));
  }
  const emailUser = await tx.user.findUnique({ where: { email: identity.email }, include: ACCOUNT_INCLUDE });
  if (emailUser) return activateGhost(tx, emailUser, identity);
  const user = await tx.user.create({ data: { name: identity.name, email: identity.email, google_sub: identity.sub,
    account_origin: "GOOGLE_EMAIL", password_hash: null, phone_number: null, is_verified: true, role: "CUSTOMER" }, include: ACCOUNT_INCLUDE });
  const welcome = await createWelcomeRewardInTransaction(tx, user.id);
  return createAccountSession(tx, await loadAccount(tx, user.id), welcome);
}
async function claimGoogle(tx: Prisma.TransactionClient, attempt: GoogleAuthAttempt, identity: GoogleIdentity) {
  if (!attempt.claim_token_hash || !attempt.claim_link_id) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  const claim = await loadClaim(tx, attempt.claim_token_hash);
  if (claim.id !== attempt.claim_link_id) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  const existing = await findGoogleUser(tx, identity);
  if (attempt.actor_user_id && attempt.actor_user_id !== existing?.id) throw new AccountError("GOOGLE_ACCOUNT_MISMATCH");
  const emailUser = await tx.user.findUnique({ where: { email: identity.email }, include: ACCOUNT_INCLUDE });
  if (emailUser && emailUser.id !== existing?.id && emailUser.id !== claim.user_id) throw new AccountError("GOOGLE_IDENTITY_ALREADY_USED");
  const consumed = await tx.accountClaimLink.updateMany({ where: { id: claim.id, token_hash: attempt.claim_token_hash, consumed_at: null, expires_at: { gt: new Date() } }, data: { consumed_at: new Date() } });
  if (consumed.count !== 1) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  if (existing && existing.id !== claim.user_id) {
    const merged = await mergeAccounts(tx, existing.id, claim.user_id, { kind: "GOOGLE_CLAIM", reference: attempt.id, actorId: existing.id });
    const welcome = await createWelcomeRewardInTransaction(tx, merged.user.id);
    const result = await createAccountSession(tx, await loadAccount(tx, merged.user.id), welcome);
    result.evicted.push(...merged.revoked); return result;
  }
  return activateGhost(tx, await loadAccount(tx, claim.user_id), identity);
}
async function linkGoogle(tx: Prisma.TransactionClient, attempt: GoogleAuthAttempt, identity: GoogleIdentity) {
  if (!attempt.actor_user_id || !attempt.actor_session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  await claimActiveCustomerForWrite(tx, attempt.actor_user_id);
  const actor = await loadAccount(tx, attempt.actor_user_id); requireActiveAccount(actor);
  if (!actor.password_hash || actor.password_hash === "GHOST_USER_NO_PASSWORD" || actor.account_origin !== "LEGACY_PHONE" || actor.google_sub) throw new AccountError("GOOGLE_LINK_INVALID");
  const other = await findGoogleUser(tx, identity);
  if (other && other.id !== actor.id) throw new AccountError("GOOGLE_IDENTITY_ALREADY_USED");
  const emailUser = await tx.user.findUnique({ where: { email: identity.email }, include: ACCOUNT_INCLUDE });
  let revoked: string[] = [];
  if (emailUser && emailUser.id !== actor.id) {
    const merged = await mergeAccounts(tx, emailUser.id, actor.id, { kind: "GOOGLE_EMAIL", reference: attempt.id, actorId: actor.id }, true);
    revoked = merged.revoked;
  }
  await tx.user.update({ where: { id: actor.id }, data: { google_sub: identity.sub, email: identity.email, is_verified: true } });
  const result = await createAccountSession(tx, await loadAccount(tx, actor.id));
  result.evicted.push(...revoked); return result;
}
async function authenticatePreparedLogin(req: Request, input: GoogleCredentialPayload) {
  const prepared = await readGoogleLoginPreparation(req, input.challenge_id);
  if (!input.turnstile_token) throw new AccountError("TURNSTILE_REQUIRED", 400, "VALIDATION_ERROR");
  if (await prisma.googleAuthAttempt.findUnique({ where: { id: prepared.id } })) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
  if (prepared.purpose === "CLAIM" && prepared.claimHash !== await claimContextHash()) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  const actor = prepared.actorHash ? await getSession() : null;
  if (prepared.actorHash && (!actor || actor.role !== "CUSTOMER" || !actor.session_id || accountDigest(actor.id) !== prepared.actorHash
    || accountDigest(actor.session_id) !== prepared.actorSessionHash)) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  const identity = await verifyGoogleIdentity(input.credential, prepared.nonceHash);
  await verifyAccountTurnstile(input.turnstile_token, getClientIp(req), "google_auth");
  const result = await accountTransaction(async tx => {
    if (prepared.expiresAt <= new Date() || await tx.googleAuthAttempt.findUnique({ where: { id: prepared.id } })) {
      throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
    }
    if (actor?.session_id) {
      await requireActorSession(tx, actor.id, actor.session_id);
      const user = await loadAccount(tx, actor.id); requireActiveAccount(user);
      if (googleClaimActorHash(user) !== prepared.actorAccountHash) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
    }
    const claim = prepared.claimHash ? await loadClaim(tx, prepared.claimHash) : null;
    if (claim && accountDigest(claim.id) !== prepared.claimLinkHash) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
    let attempt: GoogleAuthAttempt;
    try {
      attempt = await tx.googleAuthAttempt.create({ data: { id: prepared.id, purpose: prepared.purpose, nonce_hash: prepared.nonceHash,
        binding_hash: prepared.binding, expires_at: prepared.expiresAt, consumed_at: new Date(),
        claim_token_hash: prepared.claimHash, claim_link_id: claim?.id ?? null,
        actor_user_id: actor?.id ?? null, actor_session_id: actor?.session_id ?? null } });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
      throw error;
    }
    return prepared.purpose === "CLAIM" ? claimGoogle(tx, attempt, identity) : loginGoogle(tx, identity);
  });
  if (prepared.purpose === "CLAIM") await setClaimContext(req, null);
  return result;
}
/** Validate and consume the purpose-bound Google assertion, then execute its account workflow. */
export async function authenticateGoogle(req: Request, input: GoogleCredentialPayload) {
  if (input.challenge_id.startsWith("login.") || input.challenge_id.startsWith("claim.")) return authenticatePreparedLogin(req, input);
  const binding = await accountBrowserBinding(req);
  const original = await prisma.googleAuthAttempt.findUnique({ where: { id: input.challenge_id } });
  if (!original || original.binding_hash !== binding || original.consumed_at || original.verified_at || original.expires_at <= new Date()) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
  const session = await getSession();
  if (original.actor_user_id && (!session || session.id !== original.actor_user_id || session.session_id !== original.actor_session_id)) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  if (original.purpose === "CLAIM" && original.claim_token_hash !== await claimContextHash()) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  const identity = await verifyGoogleIdentity(input.credential, original.nonce_hash);
  const result = await accountTransaction(async tx => {
    const attempt = await tx.googleAuthAttempt.findUnique({ where: { id: original.id } });
    if (!attempt || attempt.binding_hash !== binding || attempt.purpose !== original.purpose || attempt.consumed_at || attempt.verified_at || attempt.expires_at <= new Date()) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
    if (attempt.actor_user_id && attempt.actor_session_id) await requireActorSession(tx, attempt.actor_user_id, attempt.actor_session_id);
    if (attempt.purpose === "REAUTH") {
      if (!attempt.actor_user_id) throw new AccountError("GOOGLE_REAUTH_REQUIRED", 400, "VALIDATION_ERROR");
      await claimActiveCustomerForWrite(tx, attempt.actor_user_id);
      const actor = await loadAccount(tx, attempt.actor_user_id); requireActiveAccount(actor);
      if (actor.google_sub !== identity.sub) throw new AccountError("GOOGLE_ACCOUNT_MISMATCH");
      const proof = randomBytes(32).toString("hex");
      const verified = await tx.googleAuthAttempt.updateMany({ where: { id: attempt.id, verified_at: null, consumed_at: null, expires_at: { gt: new Date() } },
        data: { verified_google_sub: identity.sub, verified_at: new Date(), nonce_hash: accountDigest(proof), expires_at: new Date(Date.now() + 300000) } });
      if (verified.count !== 1) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
      return { reauth_proof: `${attempt.id}.${proof}` };
    }
    const consumed = await tx.googleAuthAttempt.updateMany({ where: { id: attempt.id, binding_hash: binding, verified_at: null, consumed_at: null, expires_at: { gt: new Date() } }, data: { consumed_at: new Date() } });
    if (consumed.count !== 1) throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED");
    if (attempt.purpose === "LOGIN") return loginGoogle(tx, identity);
    if (attempt.purpose === "CLAIM") return claimGoogle(tx, attempt, identity);
    return linkGoogle(tx, attempt, identity);
  });
  if (original.purpose === "CLAIM") await setClaimContext(req, null);
  return result;
}
