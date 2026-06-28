import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import {
  findSessionWithUser,
  deleteSession,
  createSession,
  updateSessionGracePeriod,
  evictSessionCache,
  markSessionRotating,
} from '@/lib/middleware-auth';
import { checkDistributedRateLimit } from '@/lib/rateLimit';

const secretStr = process.env.JWT_SECRET;
if (!secretStr) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(secretStr);

/** User identity extracted from a verified JWT or session lookup. */
interface UserPayload {
  id: string;
  role: string;
  phone_number: string;
}

/** Result of resolveSessionFull — user context + optional new cookies to set. */
interface ResolvedSession {
  user: UserPayload | null;
  /** Non-null when the session was refreshed inline — caller must set these cookies. */
  cookieUpdates: { accessToken: string; refreshToken: string } | null;
}

/**
 * Signs a new access JWT. Used for inline token rotation in middleware.
 * 15-minute TTL, same as lib/auth.ts signJwt.
 */
async function signAccessToken(payload: UserPayload): Promise<string> {
  return new SignJWT({ id: payload.id, role: payload.role, phone_number: payload.phone_number })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

/**
 * Verify-only: checks the access_token JWT without any DB/network call.
 * Returns the user payload if valid, null if missing/expired/invalid.
 * Used for API paths — rotation is handled by /api/auth/refresh (client interceptor).
 */
async function verifyAccessToken(request: NextRequest): Promise<UserPayload | null> {
  const accessToken = request.cookies.get('access_token')?.value;
  if (!accessToken) return null;
  try {
    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    return {
      id: payload.id as string,
      role: payload.role as string,
      phone_number: payload.phone_number as string,
    };
  } catch {
    return null; // expired or invalid
  }
}

/**
 * Full session resolver — verify access_token first (fast path), then rotate
 * via refresh_token if needed (with rotation lock to prevent double-rotation).
 *
 * Used ONLY for page navigations (not API paths).
 *
 * Lock behaviour when another request holds the rotation lock:
 *   - We still return the user info (read from the session lookup, which found
 *     a valid session row), but cookieUpdates = null.
 *   - The "winning" rotation request will set the new cookies on its own response.
 *   - This means the page renders correctly for the current request even though
 *     we didn't rotate — the browser will pick up the new cookies from whichever
 *     response arrives.
 */
async function resolveSessionFull(request: NextRequest): Promise<ResolvedSession> {
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // 1. Try existing access token first (fast path — no DB/network)
  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, JWT_SECRET);
      return {
        user: {
          id: payload.id as string,
          role: payload.role as string,
          phone_number: payload.phone_number as string,
        },
        cookieUpdates: null,
      };
    } catch {
      // Expired — fall through to refresh
    }
  }

  // 2. Try inline refresh via PostgREST (no self-fetch)
  if (!refreshToken) return { user: null, cookieUpdates: null };

  const session = await findSessionWithUser(refreshToken);

  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) void deleteSession(session.id, refreshToken);
    return { user: null, cookieUpdates: null };
  }

  // We know user identity from the session row regardless of lock outcome
  const sessionUser: UserPayload = {
    id: session.user_id,
    role: session.user.role,
    phone_number: session.user.phone_number,
  };

  // 3. Acquire rotation lock — prevents concurrent requests from double-rotating
  const lockAcquired = await markSessionRotating(session.id);

  if (!lockAcquired) {
    // Another request is already rotating this session.
    // Return user info (page renders correctly) but don't rotate ourselves.
    // The winning request will deliver new cookies via its own Set-Cookie.
    return { user: sessionUser, cookieUpdates: null };
  }

  // 4. Lock acquired — perform the rotation
  try {
    await evictSessionCache(refreshToken);       // Invalidate Redis cache for old token
    await updateSessionGracePeriod(session.id);  // 30s grace so old token stays usable briefly
    const newSession = await createSession(session.user_id);
    const newAccessToken = await signAccessToken(sessionUser);

    return {
      user: sessionUser,
      cookieUpdates: {
        accessToken: newAccessToken,
        refreshToken: newSession.refresh_token,
      },
    };
  } catch {
    // Rotation failed (network/DB error) — treat as logged-out
    return { user: null, cookieUpdates: null };
  }
}

/**
 * Injects user identity into request headers so server layouts can read them
 * without doing their own session resolution.
 * Also applies refreshed cookies to the response if token was rotated.
 */
function buildAuthenticatedResponse(
  request: NextRequest,
  user: UserPayload,
  cookieUpdates: { accessToken: string; refreshToken: string } | null,
  isProduction: boolean,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.id);
  requestHeaders.set('x-user-role', user.role);
  requestHeaders.set('x-user-phone', user.phone_number);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (cookieUpdates) {
    applyCookieUpdates(res, cookieUpdates, isProduction);
  }
  return res;
}

/**
 * Applies new auth cookies to a NextResponse.
 * Used when inline token rotation happened during middleware.
 * Also sets the non-httpOnly has_session signal cookie for client-side sync.
 */
function applyCookieUpdates(
  response: NextResponse,
  updates: { accessToken: string; refreshToken: string },
  isProduction: boolean,
): NextResponse {
  const secure = isProduction;
  const sameSite = 'strict';
  const refreshMaxAge = 7 * 24 * 60 * 60;

  response.cookies.set('access_token', updates.accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 15 * 60,
    path: '/',
  });
  response.cookies.set('refresh_token', updates.refreshToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: refreshMaxAge,
    path: '/',
  });
  // Non-httpOnly signal for Zustand sync — tells client JS an active session exists.
  response.cookies.set('has_session', '1', {
    httpOnly: false,
    secure,
    sameSite,
    maxAge: refreshMaxAge,
    path: '/',
  });

  return response;
}

/**
 * Middleware for protecting routes based on roles and JWT session.
 *
 * Architecture (two distinct paths):
 *
 *  PAGE NAVIGATIONS (/, /menu, /profile, /staff, /admin, ...):
 *    - Full session resolution: verify access_token OR rotate via refresh_token.
 *    - Rotation uses an optimistic lock (rotating_at column) to prevent double-rotation.
 *    - On success: injects x-user-id/x-user-role/x-user-phone headers so layouts
 *      can read user identity WITHOUT doing their own session resolution.
 *    - This is the ONLY place rotation happens for page requests.
 *
 *  API PATHS (/api/orders, /api/profile, /api/staff, /api/admin, ...):
 *    - Verify-only: checks access_token JWT, NO rotation.
 *    - If expired → 401. Client Axios interceptor calls /api/auth/refresh to rotate.
 *    - /api/auth/* is rate-limited only (auth routes handle their own logic).
 *
 *  ROLE GUARDS:
 *    - Customer paths: Admin/Staff redirected to /staff/orders.
 *    - /staff paths: CUSTOMER role → 401/redirect.
 *    - /admin paths: STAFF role → redirect to /staff/orders.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';

  // ── 1. Auth route rate limiting ──────────────────────────────────────────
  if (pathname.startsWith('/api/auth')) {
    const ip =
      request.headers.get('x-forwarded-for') ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const { allowed } = await checkDistributedRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.', code: 'TOO_MANY_REQUESTS' },
        { status: 429 }
      );
    }
    return NextResponse.next();
  }

  // ── 2. Classify path ──────────────────────────────────────────────────────
  const isCustomerFacingPath =
    pathname === '/' ||
    pathname.startsWith('/menu') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/orders');

  const isProtectedApiPath =
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/staff') ||
    pathname.startsWith('/api/admin');

  const isProtectedPagePath =
    pathname.startsWith('/staff') ||
    pathname.startsWith('/admin');

  // Skip unmatched paths early
  if (!isCustomerFacingPath && !isProtectedApiPath && !isProtectedPagePath) {
    return NextResponse.next();
  }

  // ── 3. API paths — verify-only, no rotation ───────────────────────────────
  // Rotation for API calls is handled by /api/auth/refresh (client interceptor).
  if (isProtectedApiPath) {
    const user = await verifyAccessToken(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ', code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
      );
    }

    // Role guards for API paths
    if (
      (pathname.startsWith('/api/staff') || pathname.startsWith('/api/admin')) &&
      !['STAFF', 'ADMIN'].includes(user.role)
    ) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (pathname.startsWith('/api/admin') && user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Chỉ dành cho quản trị viên', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    return buildAuthenticatedResponse(request, user, null, isProduction);
  }

  // ── 4. Page paths — full session resolution with rotation ─────────────────
  const { user, cookieUpdates } = await resolveSessionFull(request);

  // ── 5. Customer-facing paths ──────────────────────────────────────────────
  if (isCustomerFacingPath) {
    if (user) {
      // Admin/Staff must never see the customer UI
      if (user.role === 'ADMIN' || user.role === 'STAFF') {
        const url = request.nextUrl.clone();
        url.pathname = '/staff/orders';
        const res = NextResponse.redirect(url);
        if (cookieUpdates) applyCookieUpdates(res, cookieUpdates, isProduction);
        return res;
      }
      // Authenticated CUSTOMER — inject headers + apply refreshed cookies
      return buildAuthenticatedResponse(request, user, cookieUpdates, isProduction);
    }

    // No valid session — check if this is a protected customer path
    const isCustomerProtectedPath =
      pathname.startsWith('/profile') ||
      pathname.startsWith('/history') ||
      pathname.startsWith('/orders');

    if (isCustomerProtectedPath) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth', 'login');
      return NextResponse.redirect(url);
    }

    // Public paths (/, /menu) with no session — let through
    return NextResponse.next();
  }

  // ── 6. Protected page paths (/staff/*, /admin/*) ──────────────────────────
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('auth', 'login');
    return NextResponse.redirect(url);
  }

  // Role guards for page paths
  if (pathname.startsWith('/staff') && !['STAFF', 'ADMIN'].includes(user.role)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin') && user.role !== 'ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = user.role === 'STAFF' ? '/staff/orders' : '/';
    return NextResponse.redirect(url);
  }

  return buildAuthenticatedResponse(request, user, cookieUpdates, isProduction);
}

/**
 * Matcher — covers:
 *  - Customer-facing paths needing admin/staff guard (/, /menu/*, /profile/*, etc.)
 *  - Internal protected paths (admin/*, staff/*, api/*)
 *  - Auth API endpoints (for rate limiting)
 */
export const config = {
  matcher: [
    '/',
    '/menu',
    '/menu/:path*',
    '/profile/:path*',
    '/history/:path*',
    '/orders/:path*',
    '/api/auth/:path*',
    '/api/orders/:path*',
    '/api/profile/:path*',
    '/api/staff/:path*',
    '/staff/:path*',
    '/api/admin/:path*',
    '/admin/:path*',
  ],
};
