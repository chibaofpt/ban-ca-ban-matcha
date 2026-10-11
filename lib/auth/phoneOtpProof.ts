import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PhoneOtpConfirmPayload } from "@/contracts/account";
import { prisma } from "@/lib/prisma";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { readRegistrationOtpSettings } from "@/lib/auth/registrationOtpSettings";
import { registrationOtpCode, registrationOtpHashMatches } from "@/lib/auth/registrationOtpCrypto";
import { registrationOtpActive, checkRegistrationOtpCode, releaseRegistrationOtpLease } from "@/lib/auth/registrationOtpStore";
export interface PhoneClaimContext { flow: string; payload: string; actorUserId: string; actorSessionId: string; targetUserId: string; }
export interface PhoneOtpProof { id: string; phone: string; flow: string; hash: string; token: string; }
/** Validate the delivered challenge and acquire the existing verification lease without attaching a phone. */
export async function preparePhoneOtpProof(input: PhoneOtpConfirmPayload, context: PhoneClaimContext): Promise<PhoneOtpProof> {
  if (!(await readRegistrationOtpSettings()).otp_enabled) throw new RegistrationOtpError(409, "CONFLICT", "OTP_DISABLED");
  const row = await prisma.otpAttempt.findUnique({ where: { id: input.challenge_id } });
  if (!row || row.purpose !== "PHONE_GHOST_CLAIM" || row.phone_number !== input.phone_number || row.binding_hash !== context.flow
    || row.actor_user_id !== context.actorUserId || row.actor_session_id !== context.actorSessionId || row.target_user_id !== context.targetUserId) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_INVALID");
  if (row.verified) throw new RegistrationOtpError(409, "CONFLICT", "OTP_USED");
  if (row.expires_at <= new Date()) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_EXPIRED");
  const active = await registrationOtpActive(context.flow);
  if (!active || active.id !== row.id || active.payload !== context.payload || active.data.delivery_status === "unknown") throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_INVALID");
  const hash = registrationOtpCode(row.id, input.phone_number, context.flow, context.payload, input.otp);
  const valid = registrationOtpHashMatches(row.code_hash, hash); const token = randomUUID();
  const verdict = await checkRegistrationOtpCode({ phone: input.phone_number, flow: context.flow, payload: context.payload, id: row.id, valid, token, attempts: row.attempts });
  if (verdict) {
    if (!valid && verdict.counted) await prisma.otpAttempt.updateMany({ where: { id: row.id, purpose: "PHONE_GHOST_CLAIM", binding_hash: context.flow,
      verified: false, attempts: { lt: 5 }, expires_at: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    throw verdict.error;
  }
  return { id: row.id, phone: input.phone_number, flow: context.flow, hash, token };
}
/** Consume only the actor/session/target-bound phone purpose while OTP remains enabled. */
export async function consumePhoneOtpProof(tx: Prisma.TransactionClient, proof: PhoneOtpProof, context: PhoneClaimContext): Promise<void> {
  const settings = await readRegistrationOtpSettings(tx);
  const locked = await tx.registrationOtpSettings.updateMany({ where: { id: 1, revision: settings.revision }, data: { revision: settings.revision } });
  if (locked.count !== 1) throw new RegistrationOtpError(409, "CONFLICT", "REGISTRATION_OTP_SETTINGS_CHANGED");
  if (!settings.otp_enabled) throw new RegistrationOtpError(409, "CONFLICT", "OTP_DISABLED");
  const consumed = await tx.otpAttempt.updateMany({ where: { id: proof.id, purpose: "PHONE_GHOST_CLAIM", phone_number: proof.phone,
    actor_user_id: context.actorUserId, actor_session_id: context.actorSessionId, target_user_id: context.targetUserId,
    binding_hash: proof.flow, code_hash: proof.hash, verified: false, attempts: { lt: 5 }, expires_at: { gt: new Date() } }, data: { verified: true } });
  if (consumed.count !== 1) throw new RegistrationOtpError(409, "CONFLICT", "OTP_USED");
}
/** Release only this verification lease after commit or failure. */
export async function finishPhoneOtpProof(proof: PhoneOtpProof, consumed: boolean): Promise<void> {
  await releaseRegistrationOtpLease(proof.phone, proof.flow, proof.token, proof.id, consumed).catch(() => undefined);
}