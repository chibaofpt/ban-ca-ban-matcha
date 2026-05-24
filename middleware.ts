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
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Rate Limiting for Auth Routes
  if (pathname.startsWith('/api/auth')) {
    const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests, please try again later.", code: "TOO_MANY_REQUESTS" }, { status: 429 });
    }
    // Auth routes are public, so we let them through after rate limiting
    return NextResponse.next();
  }

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

  // /admin/login is public — exempt before any auth check
  if (pathname === '/admin/login') return NextResponse.next();

  if (!isProtectedPath) return NextResponse.next();

  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!accessToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Phiên đăng nhập không hợp lệ', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (refreshToken) {
      // It's a page navigation. Try to refresh the token via fetch.
      try {
        const refreshUrl = new URL('/api/auth/refresh', request.url);
        const refreshRes = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            cookie: request.headers.get('cookie') || '',
          },
        });

        if (refreshRes.ok) {
          const redirectRes = NextResponse.redirect(request.url);
          const setCookies = refreshRes.headers.getSetCookie();
          for (const c of setCookies) {
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

  try {
    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    const userId = payload.id as string;
    const userRole = payload.role as string;

    // Role Guards
    if ((pathname.startsWith('/api/staff') || pathname.startsWith('/staff')) && !['STAFF', 'ADMIN'].includes(userRole)) {
      return redirectOrUnauthorized(request, 'Không có quyền truy cập', 'FORBIDDEN', 403, userRole);
    }
    
    if ((pathname.startsWith('/api/admin') || pathname.startsWith('/admin')) && userRole !== 'ADMIN') {
      return redirectOrUnauthorized(request, 'Chỉ dành cho quản trị viên', 'FORBIDDEN', 403, userRole);
    }

    // Inject user context
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-role', userRole);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('[MIDDLEWARE_ERROR]', error);
    
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Phiên đăng nhập hết hạn', code: 'SESSION_EXPIRED' }, { status: 401 });
    }

    if (refreshToken) {
      try {
        const refreshUrl = new URL('/api/auth/refresh', request.url);
        const refreshRes = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            cookie: request.headers.get('cookie') || '',
          },
        });

        if (refreshRes.ok) {
          const redirectRes = NextResponse.redirect(request.url);
          const setCookies = refreshRes.headers.getSetCookie();
          for (const c of setCookies) {
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
 * Sends a redirect response for regular pages or a JSON error response for API routes.
 */
function redirectOrUnauthorized(
  request: NextRequest,
  error: string,
  code: string,
  status: number,
  userRole?: string
) {
  const { pathname } = request.nextUrl;
  
  // JSON Response for API routes
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error, code }, { status });
  }

  const url = request.nextUrl.clone();

  // Handle FORBIDDEN pages (status === 403)
  if (status === 403) {
    // If STAFF tries to access /admin routes, redirect to /staff/orders
    if (userRole === 'STAFF' && pathname.startsWith('/admin')) {
      url.pathname = '/staff/orders';
      return NextResponse.redirect(url);
    }

    // Default 403 redirect for customers or others
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Handle UNAUTHORIZED pages (status === 401)
  // If attempting to access admin or staff pages, redirect to /admin/login
  if (pathname.startsWith('/admin') || pathname.startsWith('/staff')) {
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  // Default 401 redirect for all other pages (e.g. /profile -> /)
  url.pathname = '/';
  return NextResponse.redirect(url);
}

/**
 * Middleware Matcher matching protected paths and auth paths.
 */
export const config = {
  matcher: [
    '/api/auth/:path*',
    '/profile/:path*',
    '/history/:path*',
    '/orders/:path*',
    '/api/orders/:path*',
    '/api/profile/:path*',
    '/api/staff/:path*',
    '/staff/:path*',
    '/api/admin/:path*',
    '/admin/:path*'
  ],
};
