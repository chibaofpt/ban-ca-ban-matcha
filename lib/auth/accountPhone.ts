import type { AuthSession } from "@/lib/auth";
import type { PhoneOtpRequestPayload, PhoneOtpConfirmPayload } from "@/contracts/account";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { loadAccount, requireActiveAccount, requireClaimableGhost, ACCOUNT_INCLUDE } from "@/lib/auth/accountData";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { requireActorSession } from "@/lib/auth/googleChallenge";
import { accountBrowserBinding } from "@/lib/auth/accountCookies";
import { AccountError } from "@/lib/auth/accountError";
import { prisma } from "@/lib/prisma";
import { registrationOtpDigest } from "@/lib/auth/registrationOtpCrypto";
import { sendRegistrationOtp } from "@/lib/auth/registrationOtp";
import { preparePhoneOtpProof, consumePhoneOtpProof, finishPhoneOtpProof } from "@/lib/auth/phoneOtpProof";
import { mergeAccounts } from "@/lib/auth/accountMerge";
import { createAccountSession } from "@/lib/auth/accountSession";
/** Update an unused contact phone or return a verification requirement for an eligible legacy ghost. */
export async function updateAccountPhone(session: AuthSession, phone: string): Promise<{ status: "saved" | "verification_required" }> {
  if (!session.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  return accountTransaction(async tx => {
    await requireActorSession(tx, session.id, session.session_id!);
    await claimActiveCustomerForWrite(tx, session.id);
    const actor = await loadAccount(tx, session.id); requireActiveAccount(actor);
    if (actor.phone_number === phone) return { status: "saved" };
    const other = await tx.user.findUnique({ where: { phone_number: phone }, include: ACCOUNT_INCLUDE });
    if (other) {
      requireClaimableGhost(other);
      if (actor.account_origin !== "GOOGLE_EMAIL" || !actor.google_sub) throw new AccountError("PHONE_ALREADY_USED");
      return { status: "verification_required" };
    }
    await tx.user.update({ where: { id: actor.id }, data: { phone_number: phone } });
    return { status: "saved" };
  });
}
/** Bind every phone claim to the current browser, actor, stable session and target ghost. */
export async function phoneClaimContext(req: Request, session: AuthSession, phone: string, create = false) {
  if (!session.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  const actor = await loadAccount(prisma, session.id); requireActiveAccount(actor);
  if (actor.account_origin !== "GOOGLE_EMAIL" || !actor.google_sub) throw new AccountError("PHONE_CLAIM_NOT_ALLOWED");
  const target = await prisma.user.findUnique({ where: { phone_number: phone }, include: ACCOUNT_INCLUDE });
  if (!target) throw new AccountError("PHONE_CLAIM_NOT_ALLOWED");
  requireClaimableGhost(target);
  const browser = await accountBrowserBinding(req, create);
  const flow = registrationOtpDigest("phone-claim-flow", JSON.stringify([browser, session.id, session.session_id]));
  const payload = registrationOtpDigest("phone-claim-payload", JSON.stringify(["PHONE_GHOST_CLAIM", phone, session.id, session.session_id, target.id]));
  return { flow, payload, actorUserId: actor.id, actorSessionId: session.session_id, targetUserId: target.id };
}
/** Reuse the existing paid-send admission policy for an authenticated phone ghost claim. */
export async function sendPhoneClaimOtp(req: Request, session: AuthSession, input: PhoneOtpRequestPayload, ip: string) {
  const context = await phoneClaimContext(req, session, input.phone_number, true);
  return sendRegistrationOtp(req, input, ip, context);
}
/** Consume phone proof and consolidate into the legacy customer in one Serializable transaction. */
export async function confirmPhoneClaimOtp(req: Request, session: AuthSession, input: PhoneOtpConfirmPayload) {
  const context = await phoneClaimContext(req, session, input.phone_number);
  const proof = await preparePhoneOtpProof(input, context);
  let consumed = false;
  try {
    const result = await accountTransaction(async tx => {
      await requireActorSession(tx, context.actorUserId, context.actorSessionId);
      await consumePhoneOtpProof(tx, proof, context);
      const merged = await mergeAccounts(tx, context.actorUserId, context.targetUserId, { kind: "PHONE_OTP", reference: proof.id, actorId: context.actorUserId });
      const created = await createAccountSession(tx, merged.user); created.evicted.push(...merged.revoked);
      return created;
    });
    consumed = true; return result;
  } finally { await finishPhoneOtpProof(proof, consumed); }
}