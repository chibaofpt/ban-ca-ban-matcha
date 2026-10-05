import { createHmac, timingSafeEqual } from "node:crypto";
import type { RegisterPayload } from "@/contracts/auth";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";

/** Isolate local, preview/staging and production registration state. */
export function registrationOtpNamespace(): string {
  const environment = process.env.VERCEL_ENV;
  return `registration-otp:v1:${["production", "preview", "development"].includes(environment ?? "") ? environment : "local"}`;
}

/** HMAC registration state using its dedicated minimum-length server secret. */
export function registrationOtpDigest(scope: string, value: string): string {
  const secret = process.env.REGISTRATION_OTP_SECRET;
  if (!secret || secret.length < 32) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_CONFIG");
  }
  return createHmac("sha256", secret).update(`${registrationOtpNamespace()}:${scope}:${value}`).digest("hex");
}

/** Bind full normalized registration details without storing plaintext passwords in Redis. */
export function registrationOtpPayload(input: RegisterPayload, phone: string): string {
  return registrationOtpDigest("payload", JSON.stringify([phone, input.name, input.password, input.insta_name ?? null]));
}

/** Hash a code with its challenge, canonical phone, browser flow and full payload. */
export function registrationOtpCode(id: string, phone: string, flow: string, payload: string, code: string): string {
  return registrationOtpDigest("code", JSON.stringify([id, phone, flow, payload, code]));
}

/** Compare valid HMAC digests without a code-dependent string comparison. */
export function registrationOtpHashMatches(expected: string, actual: string): boolean {
  return /^[a-f0-9]{64}$/.test(expected) && /^[a-f0-9]{64}$/.test(actual)
    && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

/** Resolve the UTC+7 calendar date and seconds until its daily quota resets. */
export function registrationOtpDay(now = Date.now()): { date: string; ttl: number } {
  const shifted = new Date(now + 7 * 3600_000);
  const seconds = shifted.getUTCHours() * 3600 + shifted.getUTCMinutes() * 60 + shifted.getUTCSeconds();
  return { date: shifted.toISOString().slice(0, 10), ttl: 86400 - seconds };
}

/** Derive an external state key without exposing identifiers. */
export function registrationOtpKey(scope: string, identifier: string): string {
  return `${registrationOtpNamespace()}:${scope}:${registrationOtpDigest(scope, identifier)}`;
}
