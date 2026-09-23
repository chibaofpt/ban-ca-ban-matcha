import { createHmac, randomInt, randomUUID } from "node:crypto";
import type {
  SmsTestBalanceData, SmsTestConnectionData, SmsTestSendOtpData,
  SmsTestSendOtpRequest, SmsTestVerifyOtpRequest,
} from "@/contracts/smsTest";
import { AbenlaRejectedError, AbenlaResponseError, checkAbenlaConnection, getAbenlaBalance, sendAbenlaOtp } from "@/lib/sms/abenla";
import {
  finalizeSmsTestSend, reserveSmsTestProbe, reserveSmsTestSend, verifySmsTestOtp,
  type SmsTestOutcome,
} from "@/lib/smsTestStore";

/** A stable, sanitized SMS test error for the HTTP controller. */
export class SmsTestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly reason: string,
    public readonly providerCode?: number,
  ) {
    super(reason);
  }
}

function secret(): string {
  const value = process.env.SMS_TEST_OTP_SECRET;
  if (!value || value.length < 32) throw new SmsTestError(503, "BUSINESS_RULE_VIOLATION", "SMS_TEST_UNAVAILABLE");
  return value;
}

function digest(scope: string, value: string): string {
  return createHmac("sha256", secret()).update(`${scope}:${value}`).digest("hex");
}

function adminScope(adminId: string, sessionId: string): string {
  if (!sessionId) throw new SmsTestError(401, "UNAUTHORIZED", "SESSION_REQUIRED");
  return digest("admin-session", `${adminId}:${sessionId}`);
}

function normalizeMobile(raw: string): string {
  const cleaned = raw.replace(/[\s.()\-]/g, "");
  const local = /^0[35789]\d{8}$/.test(cleaned) ? `+84${cleaned.slice(1)}` :
    /^84[35789]\d{8}$/.test(cleaned) ? `+${cleaned}` : cleaned;
  if (!/^\+84[35789]\d{8}$/.test(local)) {
    throw new SmsTestError(400, "VALIDATION_ERROR", "INVALID_PHONE_NUMBER");
  }
  return local;
}

function errorForOutcome(outcome: SmsTestOutcome): SmsTestSendOtpData {
  if (outcome.error) {
    throw new SmsTestError(outcome.error.status, outcome.error.code, outcome.error.reason, outcome.error.provider_code);
  }
  if (!outcome.data) throw new SmsTestError(503, "BUSINESS_RULE_VIOLATION", "SMS_TEST_UNAVAILABLE");
  return outcome.data;
}

function globalWindow(now: number): { key: string; ttl: number } {
  const bangkok = new Date(now + 7 * 60 * 60 * 1000);
  const date = bangkok.toISOString().slice(0, 10);
  const secondsToday = bangkok.getUTCHours() * 3600 + bangkok.getUTCMinutes() * 60 + bangkok.getUTCSeconds();
  return { key: `sms-test:global:${date}`, ttl: 86_400 - secondsToday };
}

/** Check provider connectivity under the shared admin diagnostic quota. */
export async function smsTestConnection(adminId: string, sessionId: string): Promise<SmsTestConnectionData> {
  adminScope(adminId, sessionId);
  if (!await reserveSmsTestProbe(`sms-test:probe:${digest("admin", adminId)}`)) {
    throw new SmsTestError(429, "TOO_MANY_REQUESTS", "SMS_TEST_LIMIT");
  }
  const result = await checkAbenlaConnection();
  return { connected: result.connected, provider_code: result.providerCode, checked_at: new Date().toISOString() };
}

/** Read provider balance under the shared admin diagnostic quota. */
export async function smsTestBalance(adminId: string, sessionId: string): Promise<SmsTestBalanceData> {
  adminScope(adminId, sessionId);
  if (!await reserveSmsTestProbe(`sms-test:probe:${digest("admin", adminId)}`)) {
    throw new SmsTestError(429, "TOO_MANY_REQUESTS", "SMS_TEST_LIMIT");
  }
  const balance = await getAbenlaBalance();
  return { balance, checked_at: new Date().toISOString() };
}

/** Reserve an idempotent OTP challenge before its single provider dispatch. */
export async function smsTestSendOtp(adminId: string, sessionId: string, input: SmsTestSendOtpRequest): Promise<SmsTestSendOtpData> {
  const scope = adminScope(adminId, sessionId);
  const phone = normalizeMobile(input.phone_number);
  const phoneDigest = digest("phone", phone);
  const challengeId = randomUUID();
  const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = Date.now();
  const initialData: SmsTestSendOtpData = {
    challenge_id: challengeId,
    masked_phone: `${phone.slice(0, 5)}***${phone.slice(-3)}`,
    expires_at: new Date(now + 300_000).toISOString(),
    resend_at: new Date(now + 60_000).toISOString(),
    delivery_status: "unknown", provider_code: null, sms_per_message: null,
  };
  const global = globalWindow(now);
  const idempotencyKey = `sms-test:idempotency:${digest("admin", adminId)}:${digest("request", input.request_id)}`;
  const reservation = await reserveSmsTestSend({
    idempotencyKey,
    activeKey: `sms-test:active:${scope}`,
    markerKey: `sms-test:marker:${scope}:${challengeId}`,
    cooldownKey: `sms-test:cooldown:${digest("admin-phone", `${adminId}:${phone}`)}`,
    adminLimitKey: `sms-test:send-limit:${digest("admin", adminId)}`,
    globalLimitKey: global.key,
    challengeId, phoneDigest, sessionScope: scope, otpHash: digest("otp", `${challengeId}:${otp}`),
    initialData, globalTtlSeconds: global.ttl,
  });
  if (reservation.kind === "replay") return errorForOutcome(reservation.outcome);
  if (reservation.kind === "blocked") {
    const reason = reservation.reason === "COOLDOWN" ? "SMS_TEST_COOLDOWN" :
      reservation.reason === "CONFLICT" ? "REQUEST_ID_CONFLICT" : "SMS_TEST_LIMIT";
    const status = reservation.reason === "CONFLICT" ? 409 : 429;
    throw new SmsTestError(status, status === 409 ? "CONFLICT" : "TOO_MANY_REQUESTS", reason);
  }
  let outcome: SmsTestOutcome;
  try {
    const provider = await sendAbenlaOtp(phone, otp, randomUUID());
    outcome = { data: {
      ...initialData, delivery_status: provider.deliveryStatus,
      provider_code: provider.providerCode, sms_per_message: provider.smsPerMessage,
    } };
  } catch (error) {
    outcome = error instanceof AbenlaRejectedError
      ? { error: { status: 502, code: "BUSINESS_RULE_VIOLATION", reason: "SMS_PROVIDER_REJECTED", provider_code: error.providerCode } }
      : error instanceof AbenlaResponseError
      ? { error: { status: 502, code: "BUSINESS_RULE_VIOLATION", reason: "SMS_PROVIDER_REJECTED" } }
      : { error: { status: 503, code: "BUSINESS_RULE_VIOLATION", reason: "SMS_TEST_UNAVAILABLE" } };
  }
  await finalizeSmsTestSend(idempotencyKey, challengeId, outcome);
  return errorForOutcome(outcome);
}

/** Verify an OTP against the active session challenge with a five-wrong-attempt ceiling. */
export async function smsTestVerifyOtp(adminId: string, sessionId: string, input: SmsTestVerifyOtpRequest): Promise<{ verified: true }> {
  const scope = adminScope(adminId, sessionId);
  const result = await verifySmsTestOtp(
    `sms-test:active:${scope}`, `sms-test:marker:${scope}:${input.challenge_id}`,
    input.challenge_id, digest("otp", `${input.challenge_id}:${input.otp}`),
  );
  if (result === "VERIFIED") return { verified: true };
  const mapping: Record<Exclude<typeof result, "VERIFIED">, [number, string, string]> = {
    INVALID: [422, "BUSINESS_RULE_VIOLATION", "OTP_INVALID"],
    LOCKED: [429, "TOO_MANY_REQUESTS", "OTP_LOCKED"],
    EXPIRED: [422, "BUSINESS_RULE_VIOLATION", "OTP_EXPIRED"],
    NOT_FOUND: [404, "NOT_FOUND", "OTP_CHALLENGE_NOT_FOUND"],
  };
  const [status, code, reason] = mapping[result];
  throw new SmsTestError(status, code, reason);
}
