import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { accountBrowserBinding, accountDigest, claimContextHash } from "@/lib/auth/accountCookies";
import { AccountError } from "@/lib/auth/accountError";
import { loadClaim } from "@/lib/auth/accountClaim";
import { loadAccount, requireActiveAccount, type AccountRecord } from "@/lib/auth/accountData";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const issuer = "matcha:google-login";
const tokenType = "google-login-preparation";
/** Bind a prepared claim to the actor credentials without exposing their values. */
export function googleClaimActorHash(user: Pick<AccountRecord, "password_hash" | "google_sub">): string {
  return accountDigest(JSON.stringify([user.password_hash, user.google_sub]));
}
function configuration() {
  const secret = process.env.JWT_SECRET;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!secret || !clientId) throw new AccountError("GOOGLE_CONFIG", 503, "SERVICE_UNAVAILABLE");
  return { key: createHmac("sha256", secret).update(tokenType).digest(), clientId };
}

/** Prepare a browser-bound Google nonce, preserving claim lifetime without a database write. */
export async function prepareGoogleLogin(req: Request, purpose: "LOGIN" | "CLAIM" = "LOGIN") {
  const { key, clientId } = configuration();
  const claimHash = purpose === "CLAIM" ? await claimContextHash() : null;
  const claim = claimHash ? await loadClaim(prisma, claimHash) : null;
  const actor = purpose === "CLAIM" ? await getSession() : null;
  let actorAccountHash: string | null = null;
  if (actor) {
    if (actor.role !== "CUSTOMER" || !actor.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
    const user = await loadAccount(prisma, actor.id); requireActiveAccount(user);
    actorAccountHash = googleClaimActorHash(user);
  }
  const binding = await accountBrowserBinding(req, true);
  const nonce = randomBytes(32).toString("hex");
  const expires = Math.floor(Math.min(Date.now() + 300000, claim?.expires_at.getTime() ?? Infinity) / 1000);
  const proof = await new SignJWT({ purpose, binding_hash: binding, nonce_hash: accountDigest(nonce),
    claim_token_hash: claimHash, claim_link_hash: claim ? accountDigest(claim.id) : null,
    actor_hash: actor ? accountDigest(actor.id) : null, actor_session_hash: actor?.session_id ? accountDigest(actor.session_id) : null,
    actor_account_hash: actorAccountHash })
    .setProtectedHeader({ alg: "HS256", typ: tokenType }).setIssuer(issuer).setAudience(clientId)
    .setJti(randomUUID()).setIssuedAt().setExpirationTime(expires).sign(key);
  return { challenge_id: `${purpose === "CLAIM" ? "claim" : "login"}.${proof}`, nonce, expires_at: new Date(expires * 1000).toISOString() };
}

/** Validate preparation integrity, purpose, expiry and browser binding before exchange. */
export async function readGoogleLoginPreparation(req: Request, challengeId: string) {
  const { key, clientId } = configuration();
  const binding = await accountBrowserBinding(req);
  try {
    const { payload } = await jwtVerify(challengeId.slice(6), key, {
      algorithms: ["HS256"], typ: tokenType, issuer, audience: clientId,
      requiredClaims: ["jti", "iat", "exp", "binding_hash", "nonce_hash"],
    });
    const purpose: "CLAIM" | "LOGIN" = challengeId.startsWith("claim.") ? "CLAIM" : "LOGIN";
    const isHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
    if ((payload.purpose ?? "LOGIN") !== purpose || typeof payload.jti !== "string" || !/^[a-f0-9-]{36}$/.test(payload.jti)
      || payload.binding_hash !== binding || typeof payload.nonce_hash !== "string"
      || !/^[a-f0-9]{64}$/.test(payload.nonce_hash) || typeof payload.exp !== "number"
      || (purpose === "CLAIM" && (!isHash(payload.claim_token_hash) || !isHash(payload.claim_link_hash)))
      || (payload.actor_hash != null && (!isHash(payload.actor_hash) || !isHash(payload.actor_session_hash) || !isHash(payload.actor_account_hash)))
      || (payload.actor_hash == null && payload.actor_session_hash != null)) throw new Error("Invalid preparation");
    return { id: payload.jti, purpose, binding, nonceHash: payload.nonce_hash, expiresAt: new Date(payload.exp * 1000),
      claimHash: isHash(payload.claim_token_hash) ? payload.claim_token_hash : null,
      claimLinkHash: isHash(payload.claim_link_hash) ? payload.claim_link_hash : null,
      actorHash: isHash(payload.actor_hash) ? payload.actor_hash : null,
      actorAccountHash: isHash(payload.actor_account_hash) ? payload.actor_account_hash : null,
      actorSessionHash: isHash(payload.actor_session_hash) ? payload.actor_session_hash : null };
  } catch { throw new AccountError("GOOGLE_CHALLENGE_INVALID", 401, "UNAUTHORIZED"); }
}
