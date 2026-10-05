import { getSession } from "@/lib/auth";
import type { RegistrationOtpBalance } from "@/contracts/registrationOtp";
import { AbenlaConfigError, AbenlaResponseError, getAbenlaBalance } from "@/lib/sms/abenla";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpProbe } from "@/lib/auth/registrationOtpStore";

/** Authorize protected registration settings and diagnostics against the current ADMIN session. */
export async function requireRegistrationOtpAdmin(): Promise<string> {
  const session = await getSession();
  if (!session) throw new RegistrationOtpError(401, "UNAUTHORIZED", "SESSION_REQUIRED");
  if (session.role !== "ADMIN") throw new RegistrationOtpError(403, "FORBIDDEN", "ADMIN_REQUIRED");
  return session.id;
}

/** Read provider balance without the staging-test gate or client CAPTCHA configuration. */
export async function getRegistrationOtpBalance(adminId: string): Promise<RegistrationOtpBalance> {
  await registrationOtpProbe(adminId);
  try {
    return { balance: await getAbenlaBalance(), checked_at: new Date().toISOString() };
  } catch (error) {
    throw error instanceof AbenlaConfigError
      ? new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "SMS_PROVIDER_CONFIG")
      : error instanceof AbenlaResponseError
      ? new RegistrationOtpError(502, "BUSINESS_RULE_VIOLATION", "SMS_PROVIDER_UNAVAILABLE")
      : new RegistrationOtpError(502, "BUSINESS_RULE_VIOLATION", "SMS_PROVIDER_UNAVAILABLE");
  }
}
