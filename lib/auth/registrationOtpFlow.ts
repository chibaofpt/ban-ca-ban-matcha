import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpDigest } from "@/lib/auth/registrationOtpCrypto";

const COOKIE = "registration_otp_flow";

/** Acquire the random strict pre-auth cookie without persisting registration credentials. */
export async function registrationOtpFlow(req: Request, create = false): Promise<string> {
  const jar = await cookies();
  let raw = jar.get(COOKIE)?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) {
    if (!create) throw new RegistrationOtpError(422, "BUSINESS_RULE_VIOLATION", "OTP_FLOW_REQUIRED");
    raw = randomBytes(32).toString("hex");
    jar.set(COOKIE, raw, {
      httpOnly: true, sameSite: "strict",
      secure: new URL(req.url).protocol === "https:" || process.env.VERCEL_ENV === "production",
      path: "/api/auth/register", maxAge: 604800,
    });
  }
  return registrationOtpDigest("flow", raw);
}
