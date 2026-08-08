import { jwtVerify, SignJWT } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createSession,
  deleteSession,
  evictSessionCache,
  findSessionWithUser,
  markSessionRotating,
  updateSessionGracePeriod,
} from "@/lib/middleware-auth";
import type { buildPageSecurityHeaders } from "@/lib/securityHeaders";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(secret);

/** User identity extracted from a verified JWT or session lookup. */
export interface MiddlewareUser {
  id: string;
  role: string;
  phone_number: string;
}

/** Result of full page-session resolution, including optional rotated cookies. */
export interface ResolvedMiddlewareSession {
  user: MiddlewareUser | null;
  cookieUpdates: { accessToken: string; refreshToken: string } | null;
}

export type PageSecurityHeaders = ReturnType<typeof buildPageSecurityHeaders>;

/** Applies browser-facing security headers to a middleware response. */
export function applyPageResponseHeaders(
  response: NextResponse,
  securityHeaders: PageSecurityHeaders,
): NextResponse {
  securityHeaders.response.forEach((value, key) => response.headers.set(key, value));
  return response;
}

/** Builds a pass-through page response with nonce request and response headers. */
export function buildPageResponse(
  request: NextRequest,
  securityHeaders: PageSecurityHeaders,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  securityHeaders.request.forEach((value, key) => requestHeaders.set(key, value));
  return applyPageResponseHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    securityHeaders,
  );
}

/** Applies freshly rotated authentication cookies to a middleware response. */
export function applyCookieUpdates(
  response: NextResponse,
  updates: { accessToken: string; refreshToken: string },
  isProduction: boolean,
): NextResponse {
  const refreshMaxAge = 7 * 24 * 60 * 60;
  const cookieDefaults = { secure: isProduction, sameSite: "strict" as const, path: "/" };

  response.cookies.set("access_token", updates.accessToken, {
    ...cookieDefaults,
    httpOnly: true,
    maxAge: 15 * 60,
  });
  response.cookies.set("refresh_token", updates.refreshToken, {
    ...cookieDefaults,
    httpOnly: true,
    maxAge: refreshMaxAge,
  });
  response.cookies.set("has_session", "1", {
    ...cookieDefaults,
    httpOnly: false,
    maxAge: refreshMaxAge,
  });
  return response;
}

/** Verifies an access token without performing session rotation. */
export async function verifyAccessToken(request: NextRequest): Promise<MiddlewareUser | null> {
  const accessToken = request.cookies.get("access_token")?.value;
  if (!accessToken) return null;

  try {
    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

/** Resolves a page session and rotates an expired access token when possible. */
export async function resolveSessionFull(
  request: NextRequest,
): Promise<ResolvedMiddlewareSession> {
  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, JWT_SECRET);
      return { user: payloadToUser(payload), cookieUpdates: null };
    } catch {
      // Expired access tokens fall through to refresh-token rotation.
    }
  }
  if (!refreshToken) return { user: null, cookieUpdates: null };

  const session = await findSessionWithUser(refreshToken);
  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) void deleteSession(session.id, refreshToken);
    return { user: null, cookieUpdates: null };
  }

  const sessionUser: MiddlewareUser = {
    id: session.user_id,
    role: session.user.role,
    phone_number: session.user.phone_number,
  };
  if (!(await markSessionRotating(session.id))) {
    return { user: sessionUser, cookieUpdates: null };
  }

  try {
    await evictSessionCache(refreshToken);
    await updateSessionGracePeriod(session.id);
    const newSession = await createSession(session.user_id);
    return {
      user: sessionUser,
      cookieUpdates: {
        accessToken: await signAccessToken(sessionUser),
        refreshToken: newSession.refresh_token,
      },
    };
  } catch {
    return { user: null, cookieUpdates: null };
  }
}

/** Builds an authenticated response with identity headers and rotated cookies. */
export function buildAuthenticatedResponse(
  request: NextRequest,
  user: MiddlewareUser,
  cookieUpdates: { accessToken: string; refreshToken: string } | null,
  isProduction: boolean,
  securityHeaders?: PageSecurityHeaders,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  securityHeaders?.request.forEach((value, key) => requestHeaders.set(key, value));
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-role", user.role);
  requestHeaders.set("x-user-phone", user.phone_number);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (cookieUpdates) applyCookieUpdates(response, cookieUpdates, isProduction);
  return securityHeaders ? applyPageResponseHeaders(response, securityHeaders) : response;
}

function payloadToUser(payload: Awaited<ReturnType<typeof jwtVerify>>["payload"]): MiddlewareUser {
  return {
    id: payload.id as string,
    role: payload.role as string,
    phone_number: payload.phone_number as string,
  };
}

async function signAccessToken(payload: MiddlewareUser): Promise<string> {
  return new SignJWT({
    id: payload.id,
    role: payload.role,
    phone_number: payload.phone_number,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}
