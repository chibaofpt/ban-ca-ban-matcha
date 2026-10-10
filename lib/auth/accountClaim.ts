import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccountError } from "@/lib/auth/accountError";
import { accountDigest, claimContextHash, setClaimContext } from "@/lib/auth/accountCookies";
import { loadAccount, requireClaimableGhost } from "@/lib/auth/accountData";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { createAccountSession, revokeAccountSessions } from "@/lib/auth/accountSession";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { createWelcomeRewardInTransaction } from "@/lib/rewards/welcomeReward";
import type { ClaimPasswordPayload } from "@/contracts/account";
import { verifyAccountTurnstile } from "@/lib/auth/turnstile";
/** Validate an unconsumed current claim hash inside the consuming transaction. */
export async function loadClaim(tx: Pick<Prisma.TransactionClient, "accountClaimLink" | "user">, hash: string) {
  const claim = await tx.accountClaimLink.findUnique({ where: { token_hash: hash } });
  if (!claim || claim.consumed_at || claim.expires_at <= new Date()) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  requireClaimableGhost(await loadAccount(tx, claim.user_id));
  return claim;
}
/** Generate one five-minute fragment link, replacing every prior claim for this ghost. */
export async function issueClaimLink(req: Request, userQrToken: string, adminId: string) {
  const raw = randomBytes(32).toString("hex"); const now = new Date(); const expires = new Date(now.getTime() + 300000);
  await accountTransaction(async tx => {
    const admin = await tx.user.findUnique({ where: { id: adminId }, select: { role: true, is_blocked: true } });
    if (!admin || admin.role !== "ADMIN" || admin.is_blocked) throw new AccountError("ACCOUNT_NOT_ACTIVE", 403, "FORBIDDEN");
    const row = await tx.user.findUnique({ where: { qr_token: userQrToken }, select: { id: true } });
    if (!row) throw new AccountError("ACCOUNT_NOT_FOUND", 404, "NOT_FOUND");
    await claimActiveCustomerForWrite(tx, row.id);
    requireClaimableGhost(await loadAccount(tx, row.id));
    const data = { token_hash: accountDigest(raw), expires_at: expires, consumed_at: null, created_by: adminId };
    await tx.accountClaimLink.upsert({ where: { user_id: row.id }, create: { user_id: row.id, ...data }, update: data });
  });
  return { url: `${new URL(req.url).origin}/nhan-tai-khoan#${raw}`, expires_at: expires.toISOString(), server_now: now.toISOString() };
}
/** Exchange a fragment token for a protected context and disclose expiry only. */
export async function establishClaimContext(req: Request, token?: string) {
  const hash = token ? accountDigest(token) : await claimContextHash();
  const claim = await loadClaim(prisma, hash);
  if (token) await setClaimContext(req, token, claim.expires_at);
  return { expires_at: claim.expires_at.toISOString(), server_now: new Date().toISOString() };
}
/** Consume a legacy claim, first password, welcome entitlement and session atomically. */
export async function claimWithPassword(req: Request, input: ClaimPasswordPayload, ip: string) {
  await verifyAccountTurnstile(input.turnstile_token, ip, "account_claim");
  const hash = await claimContextHash();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await accountTransaction(async tx => {
    const claim = await loadClaim(tx, hash);
    await claimActiveCustomerForWrite(tx, claim.user_id);
    requireClaimableGhost(await loadAccount(tx, claim.user_id));
    const consumed = await tx.accountClaimLink.updateMany({ where: { id: claim.id, token_hash: hash, consumed_at: null, expires_at: { gt: new Date() } }, data: { consumed_at: new Date() } });
    if (consumed.count !== 1) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
    await tx.user.update({ where: { id: claim.user_id }, data: { password_hash: passwordHash, is_verified: true } });
    const revoked = await revokeAccountSessions(tx, [claim.user_id]);
    const welcome = await createWelcomeRewardInTransaction(tx, claim.user_id);
    const session = await createAccountSession(tx, await loadAccount(tx, claim.user_id), welcome);
    session.evicted.push(...revoked); return session;
  });
  await setClaimContext(req, null);
  return result;
}