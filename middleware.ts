import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { findSessionWithUser, deleteSession, createSession } from '@/lib/middleware-auth';

const secretStr = process.env.JWT_SECRET;
if (!secretStr) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(secretStr);

// In-memory rate limiting map for Edge (best-effort on serverless)
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || record.expiresAt < now) {
    rateLimitMap.set(ip, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count++;
  return true;
}

/** Result of resolveSession — user context + optional new cookies to set. */
interface ResolvedSession {
  user: { id: string; role: string; phone_number: string } | null;
  /** Non-null when the session was refreshed inline — caller must set these cookies. */
  cookieUpdates: { accessToken: string; refreshToken: string } | null;
}

/**
 * Signs a new access JWT. Used for inline token rotation in middleware.
 * 15-minute TTL, same as lib/auth.ts signJwt.
 */
async function signAccessToken(payload: { id: string; role: string; phone_number: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

/**
 * Central session resolver — handles all token states in one place:
 *  1. Valid access token → return user immediately (no DB hit)
 *  2. Expired access token + valid refresh token → inline rotation via PostgREST
 *  3. No tokens / dead refresh token → return null
 *
 * Eliminates the 3 duplicate self-fetch blocks that existed before.
 */
async function resolveSession(request: NextRequest): Promise<ResolvedSession> {
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
  if (refreshToken) {
    const session = await findSessionWithUser(refreshToken);

    if (!session || new Date(session.expires_at) < new Date()) {
      // Session missing or expired — clean up if needed (fire-and-forget)
      if (session) {
        void deleteSession(session.id);
      }
      return { user: null, cookieUpdates: null };
    }

    try {
      // Rotate: delete old session, create new one
      await deleteSession(session.id);
      const newSession = await createSession(session.user_id);
      const newAccessToken = await signAccessToken({
        id: session.user_id,
        role: session.user.role,
        phone_number: session.user.phone_number,
      });

      return {
        user: {
          id: session.user_id,
          role: session.user.role,
          phone_number: session.user.phone_number,
        },
        cookieUpdates: {
          accessToken: newAccessToken,
          refreshToken: newSession.refresh_token,
        },
      };
    } catch {
      // Rotation failed — treat as logged-out
      return { user: null, cookieUpdates: null };
    }
  }

  return { user: null, cookieUpdates: null };
}

/**
 * Applies new auth cookies to a NextResponse.
 * Used when inline token rotation happened during middleware.
 */
function applyCookieUpdates(
  response: NextResponse,
  updates: { accessToken: string; refreshToken: string },
  isProduction: boolean
): NextResponse {
  const secure = isProduction;
  const sameSite = 'strict';

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
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}

/**
 * Middleware for protecting routes based on roles and JWT session.
 *
 * Flow:
 *  1. Rate-limit /api/auth/* endpoints.
 *  2. Resolve session (inline refresh — no self-fetch anti-pattern).
 *  3. Customer-facing paths (/, /menu/*, /profile, /history, /orders):
 *     — Admin/Staff are redirected to /staff/orders.
 *     — Protected customer paths require auth; unauthenticated → redirect / with ?auth=login.
 *  4. Protected internal paths (/admin/*, /staff/*, /api/orders/*, /api/profile/*, etc.):
 *     — Role guards enforced.
 *     — API routes now also benefit from inline refresh (BUG-5 fixed).
 *     — x-user-id / x-user-role injected into request headers for downstream handlers.
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
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests, please try again later.', code: 'TOO_MANY_REQUESTS' },
        { status: 429 }
      );
    }
    return NextResponse.next();
  }

  // ── 2. Resolve session (single call covers all paths below) ──────────────
  const isCustomerFacingPath =
    pathname === '/' ||
    pathname.startsWith('/menu') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/orders');

  const isProtectedPath =
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/staff') ||
    pathname.startsWith('/staff') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/admin');

  // Skip unmatched paths early
  if (!isCustomerFacingPath && !isProtectedPath) {
    return NextResponse.next();
  }

  const { user, cookieUpdates } = await resolveSession(request);

  // ── 3. Customer-facing paths ──────────────────────────────────────────────
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
      // CUSTOMER — let through, apply refreshed cookies if any
      if (cookieUpdates) {
        const res = NextResponse.next();
        return applyCookieUpdates(res, cookieUpdates, isProduction);
      }
      return NextResponse.next();
    }

    // No valid session — check if this is a protected customer path
    const isCustomerProtectedPath =
      pathname.startsWith('/profile') ||
      pathname.startsWith('/history') ||
      pathname.startsWith('/orders');

    if (isCustomerProtectedPath) {
      // Redirect to home with ?auth=login so AuthGuardProvider opens the modal
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.set('auth', 'login');
      return NextResponse.redirect(url);
    }

    // Public customer path (/, /menu) with no session — let through
    return NextResponse.next();
  }

  // ── 4. Protected internal paths ───────────────────────────────────────────

  if (!user) {
    // No valid session (access token dead, refresh token dead/missing)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ', code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
      );
    }
    // Page navigation — redirect to home with login modal trigger
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('auth', 'login');
    return NextResponse.redirect(url);
  }

  // Role guards
  if (
    (pathname.startsWith('/api/staff') || pathname.startsWith('/staff')) &&
    !['STAFF', 'ADMIN'].includes(user.role)
  ) {
    return redirectOrUnauthorized(request, 'Không có quyền truy cập', 'FORBIDDEN', 403, user.role);
  }

  if (
    (pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) &&
    user.role !== 'ADMIN'
  ) {
    return redirectOrUnauthorized(request, 'Chỉ dành cho quản trị viên', 'FORBIDDEN', 403, user.role);
  }

  // Inject user context into request headers for downstream handlers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', user.id);
  requestHeaders.set('x-user-role', user.role);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Apply refreshed cookies if token was rotated mid-request
  if (cookieUpdates) applyCookieUpdates(res, cookieUpdates, isProduction);
  return res;
}

/**
 * Returns a JSON error for API routes, or a redirect for page routes.
 * All unauthenticated page redirects go to / (no separate /admin/login page).
 */
function redirectOrUnauthorized(
  request: NextRequest,
  error: string,
  code: string,
  status: number,
  userRole?: string
) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error, code },
      { status, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
    );
  }

  const url = request.nextUrl.clone();

  // 403 — wrong role: staff trying /admin → go to their own dashboard
  if (status === 403) {
    if (userRole === 'STAFF' && pathname.startsWith('/admin')) {
      url.pathname = '/staff/orders';
      return NextResponse.redirect(url);
    }
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 401 — not logged in: redirect to / with login modal trigger
  url.pathname = '/';
  url.searchParams.set('auth', 'login');
  return NextResponse.redirect(url);
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
