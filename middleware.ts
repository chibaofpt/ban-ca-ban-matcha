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
 *  2. Let /admin/login through unconditionally.
 *  3. On public customer paths (/, /menu/*) — if the visitor has an ADMIN or
 *     STAFF token, redirect them straight to their dashboard. This also fixes
 *     the PWA "start_url: /" issue: opening the pinned icon will immediately
 *     land staff/admin on their correct page.
 *  4. On protected paths (/admin, /staff, /profile, …) — enforce auth and
 *     role guards, with silent token refresh on navigation.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Auth route rate limiting ──────────────────────────────────────────
  if (pathname.startsWith('/api/auth')) {
    // /api/auth/me is a lightweight read-only session check — no rate limit needed.
    if (pathname === '/api/auth/me') return NextResponse.next();

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

  // ── 2. /admin/login — public, but redirect away if already authenticated ─
  if (pathname === '/admin/login') {
    const accessToken = request.cookies.get('access_token')?.value;
    if (accessToken) {
      try {
        const { payload } = await jwtVerify(accessToken, JWT_SECRET);
        const userRole = payload.role as string;
        const url = request.nextUrl.clone();
        if (userRole === 'ADMIN') {
          url.pathname = '/admin/menu';
          return NextResponse.redirect(url);
        }
        if (userRole === 'STAFF') {
          url.pathname = '/staff/orders';
          return NextResponse.redirect(url);
        }
      } catch {
        // Token expired/invalid — fall through and show the login form.
      }
    }
    return NextResponse.next();
  }

  // ── 3. Admin / Staff guard on public customer paths ───────────────────────
  //
  // If a logged-in admin or staff member visits /, /menu, etc., push them to
  // their dashboard immediately.  This covers the PWA cold-open scenario where
  // the manifest's start_url is "/" — the redirect happens server-side before
  // the browser renders anything.
  //
  // We also handle the expired-access-token case: if the token can't be
  // verified but a refresh_token exists, we silently refresh and redirect back
  // to the same URL so the middleware runs again with a fresh token.
  const isCustomerPublicPath = pathname === '/' || pathname.startsWith('/menu');

  if (isCustomerPublicPath) {
    const accessToken = request.cookies.get('access_token')?.value;
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (accessToken) {
      try {
        const { payload } = await jwtVerify(accessToken, JWT_SECRET);
        const userRole = payload.role as string;
        const url = request.nextUrl.clone();

        if (userRole === 'ADMIN') {
          url.pathname = '/admin/menu';
          return NextResponse.redirect(url);
        }
        if (userRole === 'STAFF') {
          url.pathname = '/staff/orders';
          return NextResponse.redirect(url);
        }
        // CUSTOMER role — let through normally.
      } catch {
        // Access token is expired. Try a silent refresh so the next pass can
        // detect the role (important for PWA opens after 15+ minutes idle).
        if (refreshToken) {
          try {
            const refreshUrl = new URL('/api/auth/refresh', request.url);
            const refreshRes = await fetch(refreshUrl, {
              method: 'POST',
              headers: { cookie: request.headers.get('cookie') || '' },
            });
            if (refreshRes.ok) {
              // Redirect back to the same URL with the new cookies applied.
              // The middleware will run again and detect ADMIN/STAFF role.
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

    // No token / CUSTOMER token / refresh failed — serve the public page.
    return NextResponse.next();
  }

  // ── 4. Protected paths — enforce auth ─────────────────────────────────────
  const isProtectedPath =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/history') ||
    pathname.startsWith('/orders') ||
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

  // 403 — wrong role
  if (status === 403) {
    if (userRole === 'STAFF' && pathname.startsWith('/admin')) {
      url.pathname = '/staff/orders';
      return NextResponse.redirect(url);
    }
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 401 — not logged in
  if (pathname.startsWith('/admin') || pathname.startsWith('/staff')) {
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  url.pathname = '/';
  return NextResponse.redirect(url);
}

/**
 * Matcher — covers:
 *  - Public customer paths that need the staff/admin redirect guard (/, /menu/*)
 *  - All protected paths (admin, staff, profile, orders, …)
 *  - Auth API endpoints (for rate limiting)
 */
export const config = {
  matcher: [
    '/',
    '/menu',
    '/menu/:path*',
    '/api/auth/:path*',
    '/profile/:path*',
    '/history/:path*',
    '/orders/:path*',
    '/api/orders/:path*',
    '/api/profile/:path*',
    '/api/staff/:path*',
    '/staff/:path*',
    '/api/admin/:path*',
    '/admin/:path*',
  ],
};
