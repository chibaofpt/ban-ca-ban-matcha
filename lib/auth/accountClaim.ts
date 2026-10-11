import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccountError } from "@/lib/auth/accountError";
import { accountDigest, claimContextHash, setClaimContext } from "@/lib/auth/accountCookies";
import { loadAccount, requireClaimableGhost } from "@/lib/auth/accountData";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import type { ClaimPasswordPayload } from "@/contracts/account";
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
/** Exchange a valid fragment for a protected context, account phone and original expiry. */
export async function establishClaimContext(req: Request, token?: string) {
  const hash = token ? accountDigest(token) : await claimContextHash();
  const claim = await loadClaim(prisma, hash);
  const user = await loadAccount(prisma, claim.user_id);
  if (!user.phone_number) throw new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION");
  if (token) await setClaimContext(req, token, claim.expires_at);
  return { phone_number: user.phone_number, expires_at: claim.expires_at.toISOString(), server_now: new Date().toISOString() };
}
/** Reject retired password claims without consuming proof or creating account credentials. */
export async function claimWithPassword(_req: Request, _input: ClaimPasswordPayload, _ip: string): Promise<never> {
  void _req; void _input; void _ip;
  throw new AccountError("GOOGLE_CLAIM_REQUIRED", 410, "BUSINESS_RULE_VIOLATION");
}
