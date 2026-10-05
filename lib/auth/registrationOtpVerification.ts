import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { RegisterPayload } from "@/contracts/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpCode, registrationOtpHashMatches, registrationOtpPayload } from "@/lib/auth/registrationOtpCrypto";
import { registrationOtpFlow } from "@/lib/auth/registrationOtpFlow";
import { readRegistrationOtpSettings } from "@/lib/auth/registrationOtpSettings";
import { checkRegistrationOtpCode, registrationOtpActive, releaseRegistrationOtpLease } from "@/lib/auth/registrationOtpStore";

export interface RegistrationOtpProof {
  id: string; phone: string; flow: string; hash: string; token: string;
}

/** Validate proof and acquire a phone verification lease before opening the account transaction. */
export async function prepareRegistrationOtpProof(req: Request, input: RegisterPayload): Promise<RegistrationOtpProof | null> {
  const settings = await readRegistrationOtpSettings();
  if (!settings.otp_enabled) return null;
  if (!input.challenge_id || !input.otp) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_REQUIRED");
  const flow = await registrationOtpFlow(req);
  const phone = normalizePhone(input.phone_number);
  const payload = registrationOtpPayload(input, phone);
  const row = await prisma.otpAttempt.findUnique({ where: { id: input.challenge_id } });
  if (!row || row.phone_number !== phone || row.binding_hash !== flow) {
    throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_INVALID");
  }
  if (row.verified) throw new RegistrationOtpError(409, "CONFLICT", "OTP_USED");
  if (row.expires_at.getTime() <= Date.now()) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_EXPIRED");
  const active = await registrationOtpActive(flow);
  if (!active || active.id !== row.id || active.payload !== payload) {
    throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_INVALID");
  }
  const hash = registrationOtpCode(row.id, phone, flow, payload, input.otp);
  const valid = registrationOtpHashMatches(row.code_hash, hash);
  const token = randomUUID();
  const verdict = await checkRegistrationOtpCode({ phone, flow, payload, id: row.id, valid, token, attempts: row.attempts });
  if (verdict) {
    if (!valid && verdict.counted) {
      // Returning rather than throwing inside the transaction commits this wrong attempt.
      await prisma.$transaction(async (tx) => tx.otpAttempt.updateMany({
        where: { id: row.id, binding_hash: flow, verified: false, attempts: { lt: 5 }, expires_at: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      }));
    }
    throw verdict.error;
  }
  return { id: row.id, phone, flow, hash, token };
}

/** Re-read and guard current settings, then consume proof inside the user/reward/session transaction. */
export async function consumeRegistrationOtpProof(tx: Prisma.TransactionClient, proof: RegistrationOtpProof | null): Promise<boolean> {
  const settings = await readRegistrationOtpSettings(tx);
  const locked = await tx.registrationOtpSettings.updateMany({
    where: { id: 1, revision: settings.revision },
    data: { revision: settings.revision },
  });
  if (locked.count !== 1) throw new RegistrationOtpError(409, "CONFLICT", "REGISTRATION_OTP_SETTINGS_CHANGED");
  if (!settings.otp_enabled) return false;
  if (!proof) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_REQUIRED");
  const consumed = await tx.otpAttempt.updateMany({
    where: {
      id: proof.id, phone_number: proof.phone, binding_hash: proof.flow, code_hash: proof.hash,
      verified: false, attempts: { lt: 5 }, expires_at: { gt: new Date() },
    },
    data: { verified: true },
  });
  if (consumed.count !== 1) throw new RegistrationOtpError(409, "CONFLICT", "OTP_USED");
  return true;
}

/** Always release the owned lease; committed database verification remains authoritative. */
export async function finishRegistrationOtpProof(proof: RegistrationOtpProof | null, consumed: boolean): Promise<void> {
  if (!proof) return;
  await releaseRegistrationOtpLease(proof.phone, proof.flow, proof.token, proof.id, consumed).catch(() => undefined);
}
