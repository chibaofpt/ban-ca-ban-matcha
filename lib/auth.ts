import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, "");

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
export async function signJwt(payload: { id: string; role: string; phone_number: string }): Promise<string> {
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
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { id: string; role: string; phone_number: string };
  } catch (error) {
    return null;
  }
}

/** Refresh token TTL in seconds: 7 days for all roles. */
function refreshTtlSeconds(role: string): number {
  return 7 * 24 * 60 * 60;   // 7 days
}

/**
 * Creates a new refresh session in the database.
 * TTL: 7 days for all roles.
 */
export async function createSession(userId: string, role: string): Promise<string> {
  const ttlMs = refreshTtlSeconds(role) * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const session = await prisma.session.create({
    data: {
      user_id: userId,
      expires_at: expiresAt,
    },
  });
  return session.refresh_token;
}

/**
 * Sets access_token and refresh_token in httpOnly cookies.
 */
export async function setAuthCookies(accessToken: string, refreshToken: string, role: string = "CUSTOMER") {
  const cookieStore = await cookies();
  const accessMaxAge = 15 * 60; // 15 mins for all roles

  cookieStore.set("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: accessMaxAge,
    path: "/",
  });

  cookieStore.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: refreshTtlSeconds(role), // 7 days for all roles
    path: "/",
  });
}

/**
 * Clears the auth cookies upon logout.
 * Also evicts the Redis session cache for the outgoing refresh_token.
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  // Evict Redis session cache immediately so the session is truly invalid
  if (refreshToken) {
    void cacheDelete(`session:${refreshToken}`);
  }

  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
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
 * Helper to get user session data from request.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  return verifyJwt(token);
}

/**
 * Attempts getSession(). If access_token is expired but refresh_token
 * is still valid, performs server-side token rotation and returns the
 * refreshed session. Returns null only when both tokens are dead.
 * Use this in server-side layout guards for customer pages.
 */
export async function getSessionOrRefresh(): Promise<{
  id: string;
  role: string;
  phone_number: string;
} | null> {
  // 1. Try normal session first
  const session = await getSession();
  if (session) return session;

  // 2. Access token dead — attempt refresh via refresh_token
  const refreshToken = await getRefreshTokenCookie();
  if (!refreshToken) return null;

  try {
    const dbSession = await prisma.session.findUnique({
      where: { refresh_token: refreshToken },
      include: { user: true },
    });

    if (!dbSession || dbSession.expires_at < new Date()) {
      if (dbSession) {
        await prisma.session.delete({ where: { id: dbSession.id } });
        // BUG-2 fix: evict stale cache so this token cannot be replayed
        void cacheDelete(`session:${refreshToken}`);
      }
      await clearAuthCookies();
      return null;
    }

    // 3. Rotate: delete old session, issue new tokens
    await prisma.session.delete({ where: { id: dbSession.id } });
    // BUG-2 fix: evict old token's cache so it cannot be replayed
    void cacheDelete(`session:${refreshToken}`);
    const newRefreshToken = await createSession(dbSession.user_id, dbSession.user.role);
    const newAccessToken = await signJwt({
      id: dbSession.user_id,
      role: dbSession.user.role,
      phone_number: dbSession.user.phone_number,
    });
    await setAuthCookies(newAccessToken, newRefreshToken, dbSession.user.role);

    return {
      id: dbSession.user_id,
      role: dbSession.user.role,
      phone_number: dbSession.user.phone_number,
    };
  } catch {
    // DB error — fail safe: return null, do not crash layout
    return null;
  }
}
