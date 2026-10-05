import type { RegistrationOtpChallenge } from "@/contracts/registrationOtp";
import { getRegistrationOtpRedisClient } from "@/lib/redis";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpDay, registrationOtpKey, registrationOtpNamespace } from "@/lib/auth/registrationOtpCrypto";
import { OTP_CLAIM, OTP_RESERVE, OTP_FINALIZE, OTP_VERIFY, OTP_RELEASE, OTP_PROBE } from "@/lib/auth/registrationOtpScripts";

interface RedisScripts {
  eval(script: string, keys: string[], args: (number | string)[]): Promise<unknown>;
}

export type RegistrationOtpOutcome = { data: RegistrationOtpChallenge } | {
  error: { status: number; code: string; reason: string; retry_at?: number; provider_code?: number };
};

interface RequestRecord {
  binding: string;
  challenge_id: string;
  dispatch_state: "checking" | "in_flight" | "final";
  outcome: RegistrationOtpOutcome;
}

export interface RegistrationOtpActive {
  id: string;
  flow: string;
  payload: string;
  data: RegistrationOtpChallenge;
}

async function evaluate(script: string, keys: string[], args: (number | string)[]): Promise<unknown> {
  try {
    const redis = getRegistrationOtpRedisClient() as RedisScripts | null;
    if (!redis) throw new Error("No Redis");
    return await redis.eval(script, keys, args);
  } catch {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  }
}

function parse<T>(value: unknown): T {
  try { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
  catch { throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE"); }
}

function resultArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  }
  return value;
}

/** Claim one flow/payload-bound request before CAPTCHA validation, without reserving paid sends. */
export async function claimRegistrationOtpRequest(key: string, binding: string, data: RegistrationOtpChallenge): Promise<
  { kind: "new" } | { kind: "replay"; outcome: RegistrationOtpOutcome }
> {
  const record: RequestRecord = { binding, challenge_id: data.challenge_id, dispatch_state: "checking", outcome: { data } };
  const result = resultArray(await evaluate(OTP_CLAIM, [key], [binding, JSON.stringify(record)]));
  if (result[0] === "CONFLICT") throw new RegistrationOtpError(409, "CONFLICT", "REQUEST_ID_CONFLICT");
  if (result[0] === "NEW") return { kind: "new" };
  if (result[0] !== "REPLAY") throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  const old = parse<RequestRecord>(result[1]);
  if (!old || old.binding !== binding || !["checking", "in_flight", "final"].includes(old.dispatch_state) || !old.outcome) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  }
  if (old.dispatch_state !== "final" && "data" in old.outcome) {
    return { kind: "replay", outcome: { data: { ...old.outcome.data, delivery_status: "unknown", provider_code: null, sms_per_message: null } } };
  }
  return { kind: "replay", outcome: old.outcome };
}

/** Atomically admit a paid send under canonical phone, IP, daily and verification-lock policies. */
export async function reserveRegistrationOtpSend(input: {
  key: string; phone: string; ip: string; flow: string; payload: string;
  challengeId: string; dailyLimit: number; now: number;
}): Promise<RegistrationOtpChallenge> {
  const day = registrationOtpDay(input.now);
  const result = resultArray(await evaluate(OTP_RESERVE, [
    input.key, registrationOtpKey("cycle", input.phone), registrationOtpKey("ip", input.ip),
    `${registrationOtpNamespace()}:day:${day.date}`, registrationOtpKey("wrong", input.phone),
    registrationOtpKey("lease", input.phone), registrationOtpKey("active-phone", input.phone),
    registrationOtpKey("active-flow", input.flow),
  ], [
    input.now, input.dailyLimit, day.ttl, input.challengeId, input.flow, input.payload, new Date(input.now + 300000).toISOString(),
    ...[120, 3600, 18000, 86400, 604800].map((delay) => new Date(input.now + delay * 1000).toISOString()),
  ]));
  if (result[0] === "NEW") return parse<RegistrationOtpChallenge>(result[1]);
  if (["OTP_BUSY", "OTP_LOCKED", "PHONE_LIMIT", "IP_LIMIT", "DAILY_LIMIT"].includes(String(result[0]))) {
    const retryAt = Number(result[1]);
    if (!Number.isFinite(retryAt)) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
    throw new RegistrationOtpError(429, "TOO_MANY_REQUESTS", String(result[0]), retryAt);
  }
  throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
}

/** Store a sanitized final request outcome without extending its original TTL. */
export async function finalizeRegistrationOtpRequest(key: string, id: string, outcome: RegistrationOtpOutcome, active?: { phone: string; flow: string }): Promise<void> {
  if (await evaluate(OTP_FINALIZE, [key, ...(active ? [registrationOtpKey("active-phone", active.phone), registrationOtpKey("active-flow", active.flow)] : [])], [id, JSON.stringify(outcome)]) !== 1) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  }
}

/** Read only the active challenge metadata belonging to a browser flow. */
export async function registrationOtpActive(flow: string): Promise<RegistrationOtpActive | null> {
  const value = await evaluate("return redis.call('GET', KEYS[1])", [registrationOtpKey("active-flow", flow)], []);
  if (value === null || value === false) return null;
  const active = parse<RegistrationOtpActive>(value);
  if (!active || typeof active.id !== "string" || active.flow !== flow || !active.data) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  }
  return active;
}

/** Atomically count a bound wrong code or acquire the correct-code verification lease. */
export async function checkRegistrationOtpCode(input: {
  phone: string; flow: string; payload: string; id: string; valid: boolean; token: string; attempts: number;
}): Promise<{ error: RegistrationOtpError; counted: boolean } | null> {
  const now = Date.now();
  const result = resultArray(await evaluate(OTP_VERIFY, [
    registrationOtpKey("active-phone", input.phone), registrationOtpKey("wrong", input.phone),
    registrationOtpKey("lease", input.phone), registrationOtpKey("verify-operation", input.token),
  ], [input.id, input.flow, input.payload, input.valid ? "1" : "0", input.token, now, input.attempts]));
  if (result[0] === "VALID") return null;
  const rawReason = String(result[0]);
  const counted = rawReason === "WRONG" || rawReason === "WRONG_LOCKED";
  const reason = rawReason === "WRONG" ? "OTP_INVALID" : rawReason === "WRONG_LOCKED" ? "OTP_LOCKED" : rawReason;
  if (reason === "OTP_INVALID" || reason === "OTP_EXPIRED") return { error: new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", reason), counted };
  if (reason === "OTP_BUSY" || reason === "OTP_LOCKED") {
    return { error: new RegistrationOtpError(429, "TOO_MANY_REQUESTS", reason, Number(result[1])), counted };
  }
  throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
}

/** Release a correct-code lease; DB failure leaves the OTP challenge usable. */
export async function releaseRegistrationOtpLease(phone: string, flow: string, token: string, id: string, consumed: boolean): Promise<void> {
  await evaluate(OTP_RELEASE, [
    registrationOtpKey("lease", phone), registrationOtpKey("active-phone", phone), registrationOtpKey("active-flow", flow),
  ], [token, consumed ? "1" : "0", id]);
}

/** Read a daily paid-send count without masking Redis failures as zero. */
export async function registrationOtpCount(key: string): Promise<number> {
  const result = await evaluate("return tonumber(redis.call('GET', KEYS[1]) or '0')", [key], []);
  if (typeof result !== "number" && !(typeof result === "string" && /^\d+$/.test(result))) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  const count = Number(result);
  if (!Number.isSafeInteger(count) || count < 0) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  return count;
}

/** Reserve a rate-limited provider balance probe for one admin. */
export async function registrationOtpProbe(adminId: string): Promise<void> {
  const result = await evaluate(OTP_PROBE, [registrationOtpKey("probe", adminId)], []);
  if (typeof result !== "number" && !(typeof result === "string" && /^\d+$/.test(result))) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  const retry = Number(result);
  if (!Number.isFinite(retry) || retry < 0) throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE");
  if (retry > 0) throw new RegistrationOtpError(429, "TOO_MANY_REQUESTS", "BALANCE_PROBE_LIMIT", Date.now() + retry);
}
