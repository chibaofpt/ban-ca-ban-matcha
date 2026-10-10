import { createHash, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizeAccountEmail, isValidGhostAccountEmail } from "@/src/utils/accountEmail";
import { AccountError } from "@/lib/auth/accountError";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });
export interface GoogleIdentity { sub: string; email: string; name: string; }
/** Verify Google's signed assertion, authoritative email ownership and browser nonce. */
export async function verifyGoogleIdentity(credential: string, nonceHash: string): Promise<GoogleIdentity> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new AccountError("GOOGLE_CONFIG", 503, "SERVICE_UNAVAILABLE");
  try {
    const { payload } = await jwtVerify(credential, googleKeys, {
      algorithms: ["RS256"], issuer: ["accounts.google.com", "https://accounts.google.com"], audience: clientId,
      requiredClaims: ["sub", "email", "email_verified", "nonce", "exp", "iat"],
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255
      || typeof payload.email !== "string" || payload.email_verified !== true
      || typeof payload.nonce !== "string" || !isValidGhostAccountEmail(payload.email)) throw new Error("Invalid identity");
    const rawEmail = payload.email.trim().toLowerCase();
    if (!rawEmail.endsWith("@gmail.com") && !(typeof payload.hd === "string" && payload.hd.trim())) throw new Error("Non-authoritative email");
    const actual = createHash("sha256").update(payload.nonce).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(nonceHash) || !timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(nonceHash, "hex"))) throw new Error("Invalid nonce");
    return { sub: payload.sub, email: normalizeAccountEmail(rawEmail), name: typeof payload.name === "string" ? payload.name.trim().slice(0, 50) || "Bạn mới" : "Bạn mới" };
  } catch { throw new AccountError("GOOGLE_ASSERTION_INVALID", 401, "UNAUTHORIZED"); }
}
