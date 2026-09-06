import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { cacheDelete } from './redis';

// The secret must be converted to a Uint8Array
const secretStr = process.env.JWT_SECRET;
if (!secretStr) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(secretStr);

/**
 * Normalizes phone number to E.164 format (+84xxxxxxxxx).
 * Handles multiple input formats from Vietnamese users:
 *  - "0912345678"      → "+84912345678"  (standard local format)
 *  - "+84912345678"    → "+84912345678"  (already normalized)
 *  - "84912345678"     → "+84912345678"  (missing leading +)
 *  - "+840912345678"   → "+84912345678"  (extra 0 after country code)
 *  - "091 234 5678"    → "+84912345678"  (spaces — common in UI input)
 *  - "091-234-5678"    → "+84912345678"  (dashes)
 */
export function normalizePhone(phone: string): string {
  // Strip whitespace, dashes, dots, parentheses
  const cleaned = phone.replace(/[\s\-\.\(\)]/g, "");

  // "84xxxxxxxxx" (11 digits, missing leading +) → "+84xxxxxxxxx"
  if (/^84\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // "+840xxxxxxxxx" (extra 0 after country code) → "+84xxxxxxxxx"
  if (/^\+840\d{9}$/.test(cleaned)) {
    return `+84${cleaned.slice(4)}`;
  }

  // "0xxxxxxxxx" (10 digits) → "+84xxxxxxxxx"
  if (/^0\d{9}$/.test(cleaned)) {
    return `+84${cleaned.slice(1)}`;
  }

  // "+84xxxxxxxxx" already normalized — return as-is
  return cleaned;
}


/**
 * Signs a JWT token with HS256. 15 minutes for all roles.
 */
export async function signJwt(payload: { id: string; role: string; phone_number: string; sid: string }): Promise<string> {
  const expiresIn = "15m";
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Verifies the access token and returns its payload.
 */
export async function verifyJwt(token: string) {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (protectedHeader.alg !== "HS256" || typeof payload.id !== "string" ||
        typeof payload.role !== "string" || typeof payload.phone_number !== "string" ||
        typeof payload.sid !== "string") return null;
    return payload as { id: string; role: string; phone_number: string; sid: string };
  } catch {
    return null;
  }
}

/** Refresh token TTL in seconds: 7 days for all roles. */
function refreshTtlSeconds(role: string): number {
  void role;
  return 7 * 24 * 60 * 60;   // 7 days
}

/**
 * Creates a new refresh session in the database.
 * TTL: 7 days for all roles.
 */
export async function createSession(userId: string, role: string): Promise<{ id: string; refreshToken: string }> {
  const ttlMs = refreshTtlSeconds(role) * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const session = await prisma.session.create({
    data: {
      user_id: userId,
      expires_at: expiresAt,
    },
  });
  return { id: session.id, refreshToken: session.refresh_token };
}

/**
 * Sets access_token, refresh_token, and has_session cookies.
 * has_session is NOT httpOnly so client JS can read it to sync Zustand state.
 */
export async function setAuthCookies(accessToken: string, refreshToken: string, role: string = "CUSTOMER") {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === "production";
  const accessMaxAge = 15 * 60; // 15 mins
  const refreshMaxAge = refreshTtlSeconds(role); // 7 days

  cookieStore.set("access_token", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: accessMaxAge,
    path: "/",
  });

  cookieStore.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: refreshMaxAge,
    path: "/",
  });

  // Non-httpOnly signal cookie — allows client JS to detect active session
  // without reading auth credentials. Used to sync Zustand with cookie state.
  cookieStore.set("has_session", "1", {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    maxAge: refreshMaxAge,
    path: "/",
  });
}

/**
 * Clears all auth cookies upon logout.
 * Also evicts the Redis session cache for the outgoing refresh_token.
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  // Evict legacy cache keys; authorization trusts the database, not this cache.
  if (refreshToken) {
    await cacheDelete(`session:${refreshToken}`);
  }

  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
  cookieStore.delete("has_session");
}

/**
 * Retrieves the refresh token from cookies.
 */
export async function getRefreshTokenCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("refresh_token")?.value;
  return token || null;
}

/**
 * Verifies the access JWT and its live database session, returning the user's current role.
 * Returns null for missing/invalid tokens, revoked/expired sessions or database failures.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  const claims = await verifyJwt(token);
  if (!claims) return null;
  try {
    const session = await prisma.session.findFirst({
      where: { id: claims.sid, user_id: claims.id, expires_at: { gt: new Date() } },
      include: { user: { select: { id: true, role: true, phone_number: true } } },
    });
    if (!session || session.user.id !== claims.id) return null;
    return { id: session.user.id, role: session.user.role, phone_number: session.user.phone_number };
  } catch {
    return null;
  }
}

/**
 * Reads the user session from middleware-injected request headers.
 *
 * Middleware resolves and rotates sessions for all page navigations, then
 * injects x-user-id / x-user-role / x-user-phone into the request headers.
 * Server layouts call this function instead of doing their own cookie checks,
 * which eliminates double-rotation within the same request cycle.
 *
 * Returns null if the user is not authenticated (middleware didn't inject headers).
 */
export async function getSessionFromHeaders(): Promise<{
  id: string;
  role: string;
  phone_number: string;
} | null> {
  const h = await headers();
  const id = h.get("x-user-id");
  const role = h.get("x-user-role");
  const phone = h.get("x-user-phone");
  if (!id || !role) return null;
  return { id, role, phone_number: phone ?? "" };
}
