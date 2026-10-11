import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { accountBrowserBinding, accountDigest } from "@/lib/auth/accountCookies";
import { AccountError } from "@/lib/auth/accountError";

const issuer = "matcha:google-login";
const tokenType = "google-login-preparation";
function configuration() {
  const secret = process.env.JWT_SECRET;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!secret || !clientId) throw new AccountError("GOOGLE_CONFIG", 503, "SERVICE_UNAVAILABLE");
  return { key: createHmac("sha256", secret).update(tokenType).digest(), clientId };
}

/** Prepare a short-lived browser-bound Google nonce without allocating a database attempt. */
export async function prepareGoogleLogin(req: Request) {
  const { key, clientId } = configuration();
  const binding = await accountBrowserBinding(req, true);
  const nonce = randomBytes(32).toString("hex");
  const expires = Math.floor(Date.now() / 1000) + 300;
  const proof = await new SignJWT({ binding_hash: binding, nonce_hash: accountDigest(nonce) })
    .setProtectedHeader({ alg: "HS256", typ: tokenType }).setIssuer(issuer).setAudience(clientId)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime(expires).sign(key);
  return { challenge_id: `login.${proof}`, nonce, expires_at: new Date(expires * 1000).toISOString() };
}

/** Validate preparation integrity, expiry and browser binding before the LOGIN-only exchange. */
export async function readGoogleLoginPreparation(req: Request, challengeId: string) {
  const { key, clientId } = configuration();
  const binding = await accountBrowserBinding(req);
  try {
    const { payload } = await jwtVerify(challengeId.slice(6), key, {
      algorithms: ["HS256"], typ: tokenType, issuer, audience: clientId,
      requiredClaims: ["jti", "iat", "exp", "binding_hash", "nonce_hash"],
    });
    if (typeof payload.jti !== "string" || !/^[a-f0-9-]{36}$/.test(payload.jti)
      || payload.binding_hash !== binding || typeof payload.nonce_hash !== "string"
      || !/^[a-f0-9]{64}$/.test(payload.nonce_hash) || typeof payload.exp !== "number") throw new Error("Invalid preparation");
    return { id: payload.jti, binding, nonceHash: payload.nonce_hash, expiresAt: new Date(payload.exp * 1000) };
  } catch { throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED"); }
}
