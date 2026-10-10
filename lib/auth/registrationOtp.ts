import type { PhoneOtpRequestPayload } from "@/contracts/account";
import type { PhoneClaimContext } from "@/lib/auth/phoneOtpProof";
import { loadAccount, requireActiveAccount, requireClaimableGhost } from "@/lib/auth/accountData";
import { requireActorSession } from "@/lib/auth/googleChallenge";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { randomInt, randomUUID } from "node:crypto";
import type { RegistrationOtpChallenge, RegistrationOtpConfig, RegistrationOtpSend } from "@/contracts/registrationOtp";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth";
import { AbenlaConfigError, AbenlaRejectedError, sendAbenlaOtp } from "@/lib/sms/abenla";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpCode, registrationOtpDigest, registrationOtpKey, registrationOtpPayload } from "@/lib/auth/registrationOtpCrypto";
import { registrationOtpFlow } from "@/lib/auth/registrationOtpFlow";
import { readRegistrationOtpSettings } from "@/lib/auth/registrationOtpSettings";
import {
  claimRegistrationOtpRequest, finalizeRegistrationOtpRequest, registrationOtpActive,
  reserveRegistrationOtpSend, type RegistrationOtpOutcome,
} from "@/lib/auth/registrationOtpStore";
import { registrationTurnstileConfig, verifyRegistrationTurnstile } from "@/lib/auth/turnstile";

function outcomeData(outcome: RegistrationOtpOutcome): RegistrationOtpChallenge {
  if ("data" in outcome) return { ...outcome.data, server_now: new Date().toISOString() };
  throw new RegistrationOtpError(outcome.error.status, outcome.error.code, outcome.error.reason, outcome.error.retry_at, outcome.error.provider_code);
}

function safeOutcome(error: unknown): RegistrationOtpOutcome {
  const failure = error instanceof RegistrationOtpError ? error
    : error instanceof AbenlaRejectedError ? new RegistrationOtpError(502, "BUSINESS_RULE_VIOLATION", "SMS_PROVIDER_REJECTED", undefined, error.providerCode)
    : error instanceof AbenlaConfigError ? new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_CONFIG")
    : new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_UNAVAILABLE");
  return { error: {
    status: failure.status, code: failure.code, reason: failure.reason,
    ...(failure.retryAt === undefined ? {} : { retry_at: failure.retryAt }),
    ...(failure.providerCode === undefined ? {} : { provider_code: failure.providerCode }),
  } };
}

async function checkRegistrationIdentity(phone: string, instagram?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone_number: phone } });
  if (user && (user.role !== "CUSTOMER" || user.password_hash !== "GHOST_USER_NO_PASSWORD")) {
    throw new RegistrationOtpError(409, "CONFLICT", "PHONE_ALREADY_REGISTERED");
  }
  if (user?.is_blocked) throw new RegistrationOtpError(403, "FORBIDDEN", "ACCOUNT_BLOCKED");
  if (instagram) {
    const alias = await prisma.user.findUnique({ where: { insta_name: instagram } });
    if (alias && alias.id !== user?.id) throw new RegistrationOtpError(409, "CONFLICT", "INSTAGRAM_ALREADY_USED");
  }
}

/** Return authoritative registration mode and resume only the current cookie-bound unexpired challenge. */
export async function getRegistrationOtpConfig(req: Request): Promise<RegistrationOtpConfig> {
  const settings = await readRegistrationOtpSettings();
  if (!settings.otp_enabled) return { enabled: false, turnstile: null, challenge: null };
  const turnstile = registrationTurnstileConfig();
  const flow = await registrationOtpFlow(req, true);
  const active = await registrationOtpActive(flow);
  if (!active) return { enabled: true, turnstile, challenge: null };
  const row = await prisma.otpAttempt.findUnique({ where: { id: active.id } });
  const challenge = row && !row.verified && row.binding_hash === flow && row.expires_at.getTime() > Date.now()
    ? { ...active.data, expires_at: row.expires_at.toISOString(), server_now: new Date().toISOString() } : null;
  return { enabled: true, turnstile, challenge };
}

/** Validate CAPTCHA, reserve one paid send, persist its challenge and dispatch ABENLA once. */
export async function sendRegistrationOtp(req: Request, input: RegistrationOtpSend | PhoneOtpRequestPayload, ip: string, context?: PhoneClaimContext): Promise<RegistrationOtpChallenge> {
  const settings = await readRegistrationOtpSettings();
  if (!settings.otp_enabled) throw new RegistrationOtpError(409, "CONFLICT", "OTP_DISABLED");
  registrationTurnstileConfig();
  const flow = context?.flow ?? await registrationOtpFlow(req);
  const phone = normalizePhone(input.phone_number);
  const payload = context?.payload ?? registrationOtpPayload(input as RegistrationOtpSend, phone);
  const binding = registrationOtpDigest("request-binding", JSON.stringify([flow, phone, payload]));
  const key = registrationOtpKey("request", input.request_id);
  const id = randomUUID();
  const now = Date.now();
  const initial: RegistrationOtpChallenge = {
    challenge_id: id, masked_phone: `${phone.slice(0, 5)}***${phone.slice(-3)}`, server_now: new Date(now).toISOString(),
    expires_at: new Date(now + 300000).toISOString(), resend_at: new Date(now + 120000).toISOString(),
    delivery_status: "unknown", provider_code: null, sms_per_message: null,
  };
  const ownership = await claimRegistrationOtpRequest(key, binding, initial);
  if (ownership.kind === "replay") return outcomeData(ownership.outcome);
  let outcome: RegistrationOtpOutcome;
  try {
    if (!context) await checkRegistrationIdentity(phone, "insta_name" in input ? input.insta_name : undefined);
    if (context) { requireActiveAccount(await loadAccount(prisma, context.actorUserId)); requireClaimableGhost(await loadAccount(prisma, context.targetUserId)); }
    await verifyRegistrationTurnstile(input.turnstile_token, ip, context ? "phone_claim" : "registration_otp");
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    // Retry only DB conflicts before the first Redis admission call; uncertain paid reservations are retained.
    let admissionStarted = false;
    const admit = () => prisma.$transaction(async (tx) => {
      if (context) {
        await requireActorSession(tx, context.actorUserId, context.actorSessionId);
        for (const id of [context.actorUserId, context.targetUserId].sort()) await claimActiveCustomerForWrite(tx, id);
        const target = await loadAccount(tx, context.targetUserId); requireClaimableGhost(target);
        const actor = await loadAccount(tx, context.actorUserId); requireActiveAccount(actor);
        if (target.phone_number !== phone || actor.account_origin !== "GOOGLE_EMAIL" || !actor.google_sub) throw new RegistrationOtpError(409, "CONFLICT", "PHONE_CLAIM_NOT_ALLOWED");
      }
      const current = await readRegistrationOtpSettings(tx);
      const guard = await tx.registrationOtpSettings.updateMany({
        where: { id: 1, revision: current.revision }, data: { revision: current.revision },
      });
      if (guard.count !== 1) throw new RegistrationOtpError(409, "CONFLICT", "REGISTRATION_OTP_SETTINGS_CHANGED");
      if (!current.otp_enabled) throw new RegistrationOtpError(409, "CONFLICT", "OTP_DISABLED");
      const reservedAt = Date.now();
      admissionStarted = true;
      const reserved = await reserveRegistrationOtpSend({
        key, phone, ip, flow, payload, challengeId: id, dailyLimit: current.daily_send_limit, now: reservedAt,
      });
      await tx.otpAttempt.updateMany({
        where: { phone_number: phone, binding_hash: { not: null }, verified: false },
        data: { expires_at: new Date(reservedAt) },
      });
      await tx.otpAttempt.create({ data: {
        id, phone_number: phone, binding_hash: flow,
        purpose: context ? "PHONE_GHOST_CLAIM" : "LEGACY_REGISTRATION",
        actor_user_id: context?.actorUserId, actor_session_id: context?.actorSessionId, target_user_id: context?.targetUserId,
        code_hash: registrationOtpCode(id, phone, flow, payload, code),
        expires_at: new Date(reserved.expires_at),
      } });
      return reserved;
    }, { isolationLevel: "Serializable", maxWait: 3000, timeout: 6000 });
    let data: RegistrationOtpChallenge | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { data = await admit(); break; }
      catch (error) {
        if (admissionStarted || attempt === 2 || !(error instanceof Error && "code" in error && error.code === "P2034")) throw error;
      }
    }
    if (!data) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_UNAVAILABLE");
    const provider = await sendAbenlaOtp(phone, code, id, "{otp}");
    outcome = { data: {
      ...data, delivery_status: provider.deliveryStatus,
      provider_code: provider.providerCode, sms_per_message: provider.smsPerMessage,
    } };
  } catch (error) { outcome = safeOutcome(error); }
  await finalizeRegistrationOtpRequest(key, id, outcome, { phone, flow });
  return outcomeData(outcome);
}
