import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_BYTES = 16 * 1024;

function config(): { siteKey: string; secret: string } {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!siteKey || !secret) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "TURNSTILE_CONFIG");
  }
  return { siteKey, secret };
}

/** Expose only the intentionally public Turnstile widget key and action. */
export function registrationTurnstileConfig(): { site_key: string; action: "registration_otp" } {
  return { site_key: config().siteKey, action: "registration_otp" };
}

async function readBounded(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing verification response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error("Verification response too large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } finally { await reader.cancel().catch(() => undefined); }
}

/** Reject invalid tokens while permitting only genuine upstream outages to use OTP quota fallback. */
export async function verifyRegistrationTurnstile(token: string, ip: string): Promise<"accepted" | "outage"> {
  const { secret } = config();
  if (token.length > 2048) throw new RegistrationOtpError(403, "FORBIDDEN", "TURNSTILE_REQUIRED");
  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST", body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
  } catch { return "outage"; }
  if (response.status >= 500) return "outage";
  if (!response.ok) throw new RegistrationOtpError(403, "FORBIDDEN", "TURNSTILE_REJECTED");
  let result: unknown;
  try { result = await readBounded(response); }
  catch (error) {
    if (error instanceof TypeError || error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return "outage";
    throw new RegistrationOtpError(403, "FORBIDDEN", "TURNSTILE_REJECTED");
  }
  if (!result || typeof result !== "object") throw new RegistrationOtpError(403, "FORBIDDEN", "TURNSTILE_REJECTED");
  const data = result as { success?: unknown; hostname?: unknown; action?: unknown; "error-codes"?: unknown };
  if (Array.isArray(data["error-codes"]) && data["error-codes"].some((code) => code === "invalid-input-secret" || code === "missing-input-secret")) {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "TURNSTILE_CONFIG");
  }
  if (data.success === false && Array.isArray(data["error-codes"]) &&
    data["error-codes"].length === 1 && data["error-codes"][0] === "internal-error") return "outage";
  if (data.success !== true || typeof data.hostname !== "string" || !data.hostname.trim()
    || data.action !== "registration_otp") {
    throw new RegistrationOtpError(403, "FORBIDDEN", "TURNSTILE_REJECTED");
  }
  return "accepted";
}
