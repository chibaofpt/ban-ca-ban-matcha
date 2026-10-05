import { importJWK, SignJWT } from "jose";
import { after } from "next/server";
import { z } from "zod";
import type { OrderRealtimeToken } from "@/contracts/realtime";

const signingKeySchema = z.object({
  kty: z.literal("EC"), crv: z.literal("P-256"),
  alg: z.literal("ES256"), kid: z.string().min(1),
  d: z.string().min(1), x: z.string().min(1), y: z.string().min(1),
});

/** Mint a five-minute operator capability using the imported Supabase signing key. */
export async function createOrderRealtimeToken(
  role: "ADMIN" | "STAFF", sessionId: string,
): Promise<OrderRealtimeToken> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey = process.env.SUPABASE_REALTIME_SIGNING_JWK;
  if (!url || !rawKey || !sessionId) throw new Error("Realtime configuration unavailable");
  const jwk = signingKeySchema.parse(JSON.parse(rawKey));
  const key = await importJWK(jwk, "ES256");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;
  const token = await new SignJWT({
    role: "authenticated", app_role: role, purpose: "order-realtime",
  })
    .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" })
    .setSubject(sessionId)
    .setIssuer(new URL("/auth/v1", url).toString())
    .setAudience("authenticated")
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expires_at: expiresAt, topic: "orders:operations", event: "orders_changed" };
}

/** Schedule an enabled signal after the response without creating work when Realtime is disabled. */
export function scheduleOrderChange(): void {
  if (!process.env.SUPABASE_REALTIME_SIGNING_JWK || !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return;
  after(publishOrderChange);
}

/** Publish a minimal order-change signal after the business transaction commits. */
export async function publishOrderChange(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = secretKey || legacyKey;
  if (!url || !key || !process.env.SUPABASE_REALTIME_SIGNING_JWK) return;
  try {
    const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
    if (!secretKey && legacyKey) headers.Authorization = `Bearer ${legacyKey}`;
    const response = await fetch(new URL("/realtime/v1/api/broadcast", url).toString(), {
      method: "POST", headers,
      body: JSON.stringify({ messages: [{
        topic: "orders:operations", event: "orders_changed", payload: {}, private: true,
      }] }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) console.warn("[order-realtime] signal delivery failed");
  } catch {
    console.warn("[order-realtime] signal delivery failed");
  }
}
