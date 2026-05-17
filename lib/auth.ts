import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

// The secret must be converted to a Uint8Array
const secretStr = process.env.JWT_SECRET || "fallback_secret_for_dev_only_do_not_use_in_prod";
const JWT_SECRET = new TextEncoder().encode(secretStr);

/**
 * Normalizes phone number format from 0xxxxxxxxx to +84xxxxxxxxx.
 */
export function normalizePhone(phone: string): string {
  if (phone.startsWith("0")) {
    return `+84${phone.slice(1)}`;
  }
  return phone;
}

/**
 * Signs a JWT token with HS256. 7 days for STAFF/ADMIN, 15 minutes for CUSTOMER.
 */
export async function signJwt(payload: { id: string; role: string; phone_number: string }): Promise<string> {
  const isStaffOrAdmin = payload.role === "STAFF" || payload.role === "ADMIN";
  const expiresIn = isStaffOrAdmin ? "7d" : "15m";
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

/**
 * Creates a new refresh session in the database.
 */
export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
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
  const isStaffOrAdmin = role === "STAFF" || role === "ADMIN";
  const accessMaxAge = isStaffOrAdmin ? 7 * 24 * 60 * 60 : 15 * 60; // 7 days for staff/admin, 15 mins for others

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
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });
}

/**
 * Clears the auth cookies upon logout.
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies();
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
