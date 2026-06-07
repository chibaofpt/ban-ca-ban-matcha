import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secretStr = process.env.JWT_SECRET;
if (!secretStr) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = new TextEncoder().encode(secretStr);

// In-memory rate limiting map for Edge
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute per IP

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

/**
 * Middleware for protecting routes based on roles and JWT session.
 *
 * Flow:
 *  1. Rate-limit auth endpoints.
 *  2. On public customer paths (/, /menu/*, /profile, /history, /orders client-side)
 *     — if the visitor has an ADMIN or STAFF token, redirect them to /staff/orders.
 *     This covers the PWA cold-open scenario and prevents admin/staff from ever
 *     seeing the customer UI.
 *  3. On protected paths (/admin/*, /staff/*, /api/profile/*, …) — enforce auth
 *     and role guards, with silent token refresh on page navigation.
 *
 * Note: /admin/login no longer exists — it was removed when all roles were
 * unified into the single customer-facing login modal.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // ── 2. Admin/Staff guard on ALL customer-facing paths ────────────────────
  //
  // Admin and staff must never see the customer UI. If their token is detected
  // on any public/customer path, redirect them straight to /staff/orders.
  //
  // We also handle the expired-access-token case: silently refresh and redirect
  // back to the same URL so the middleware re-runs with a fresh token.
  const isCustomerFacingPath =
    pathname === '/' ||
    pathname.startsWith('/menu') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/orders');

  if (isCustomerFacingPath) {
    const accessToken = request.cookies.get('access_token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (accessToken) {
      try {
        const { payload } = await jwtVerify(accessToken, JWT_SECRET);
        const userRole = payload.role as string;

        if (userRole === 'ADMIN' || userRole === 'STAFF') {
          const url = request.nextUrl.clone();
          url.pathname = '/staff/orders';
          return NextResponse.redirect(url);
        }
        // CUSTOMER role — let through normally.
      } catch {
        // Access token expired — silently refresh so the next middleware pass
        // can detect admin/staff role. Important for PWA cold-opens after idle.
        if (refreshToken) {
          try {
            const refreshUrl = new URL('/api/auth/refresh', request.url);
            const refreshRes = await fetch(refreshUrl, {
              method: 'POST',
              headers: { cookie: request.headers.get('cookie') || '' },
            });
            if (refreshRes.ok) {
              const redirectRes = NextResponse.redirect(request.url);
              for (const c of refreshRes.headers.getSetCookie()) {
                redirectRes.headers.append('Set-Cookie', c);
              }
              return redirectRes;
            }
          } catch {
            // Refresh failed — treat as logged-out, let through as normal visitor.
          }
        }
      }
    }

    // No token / CUSTOMER token / refresh failed — for protected customer paths
    // (/profile, /history, /orders) require auth; for public paths let through.
    const isCustomerProtectedPath =
      pathname.startsWith('/profile') ||
      pathname.startsWith('/history') ||
      pathname.startsWith('/orders');

    if (isCustomerProtectedPath && !accessToken) {
      // No valid session — try refresh one more time (covers no-access-token case)
      const refreshToken2 = request.cookies.get('refresh_token')?.value;
      if (refreshToken2) {
        try {
          const refreshUrl = new URL('/api/auth/refresh', request.url);
          const refreshRes = await fetch(refreshUrl, {
            method: 'POST',
            headers: { cookie: request.headers.get('cookie') || '' },
          });
          if (refreshRes.ok) {
            const redirectRes = NextResponse.redirect(request.url);
            for (const c of refreshRes.headers.getSetCookie()) {
              redirectRes.headers.append('Set-Cookie', c);
            }
            return redirectRes;
          }
        } catch (fetchError) {
          console.error('[MIDDLEWARE_REFRESH_ERROR]', fetchError);
        }
      }
      return redirectOrUnauthorized(request, 'Phiên đăng nhập không hợp lệ', 'UNAUTHORIZED', 401);
    }

    return NextResponse.next();
  }

  // ── 3. Protected internal paths — enforce auth ────────────────────────────
  const isProtectedPath =
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/staff') ||
    pathname.startsWith('/staff') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/admin');

  if (!isProtectedPath) return NextResponse.next();

  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // No access token at all
  if (!accessToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập không hợp lệ', code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
      );
    }

    // Page navigation — try to refresh
    if (refreshToken) {
      try {
        const refreshUrl = new URL('/api/auth/refresh', request.url);
        const refreshRes = await fetch(refreshUrl, {
          method: 'POST',
          headers: { cookie: request.headers.get('cookie') || '' },
        });
        if (refreshRes.ok) {
          const redirectRes = NextResponse.redirect(request.url);
          for (const c of refreshRes.headers.getSetCookie()) {
            redirectRes.headers.append('Set-Cookie', c);
          }
          return redirectRes;
        }
      } catch (fetchError) {
        console.error('[MIDDLEWARE_REFRESH_ERROR]', fetchError);
      }
    }

    return redirectOrUnauthorized(request, 'Phiên đăng nhập không hợp lệ', 'UNAUTHORIZED', 401);
  }

  // Access token present — verify it
  try {
    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    const userId = payload.id as string;
    const userRole = payload.role as string;

    // Role guards
    if (
      (pathname.startsWith('/api/staff') || pathname.startsWith('/staff')) &&
      !['STAFF', 'ADMIN'].includes(userRole)
    ) {
      return redirectOrUnauthorized(request, 'Không có quyền truy cập', 'FORBIDDEN', 403, userRole);
    }

    if (
      (pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) &&
      userRole !== 'ADMIN'
    ) {
      return redirectOrUnauthorized(request, 'Chỉ dành cho quản trị viên', 'FORBIDDEN', 403, userRole);
    }

    // Inject user context into request headers for downstream handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-role', userRole);

    return NextResponse.next({ request: { headers: requestHeaders } });

  } catch (error) {
    console.error('[MIDDLEWARE_ERROR]', error);

    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Phiên đăng nhập hết hạn', code: 'SESSION_EXPIRED' },
        { status: 401, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
      );
    }

    // Page navigation with expired token — try to refresh
    if (refreshToken) {
      try {
        const refreshUrl = new URL('/api/auth/refresh', request.url);
        const refreshRes = await fetch(refreshUrl, {
          method: 'POST',
          headers: { cookie: request.headers.get('cookie') || '' },
        });
        if (refreshRes.ok) {
          const redirectRes = NextResponse.redirect(request.url);
          for (const c of refreshRes.headers.getSetCookie()) {
            redirectRes.headers.append('Set-Cookie', c);
          }
          return redirectRes;
        }
      } catch (fetchError) {
        console.error('[MIDDLEWARE_REFRESH_ERROR]', fetchError);
      }
    }

    return redirectOrUnauthorized(request, 'Phiên đăng nhập hết hạn', 'SESSION_EXPIRED', 401);
  }
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

  // 401 — not logged in: all roles go to / (login modal is there)
  url.pathname = '/';
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
