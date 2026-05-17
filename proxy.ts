import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Keep the secret in Edge Runtime
const secretStr = process.env.JWT_SECRET || "fallback_secret_for_dev_only_do_not_use_in_prod";
const JWT_SECRET = new TextEncoder().encode(secretStr);

/**
 * Middleware for protecting routes based on roles and JWT session.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedPath =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/api/orders') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/staff') ||
    pathname.startsWith('/staff') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/admin');

  // /admin/login is public — exempt before any auth check
  if (pathname === '/admin/login') return NextResponse.next();

  if (!isProtectedPath) return NextResponse.next();

  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return redirectOrUnauthorized(request, 'Phiên đăng nhập không hợp lệ', 'UNAUTHORIZED', 401);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
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
 * Middleware Matcher matching protected paths.
 */
export const config = {
  matcher: [
    '/profile/:path*',
    '/api/orders/:path*',
    '/api/profile/:path*',
    '/api/staff/:path*',
    '/staff/:path*',
    '/api/admin/:path*',
    '/admin/:path*'
  ],
};
