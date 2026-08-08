import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  applyCookieUpdates,
  applyPageResponseHeaders,
  buildAuthenticatedResponse,
  buildPageResponse,
  resolveSessionFull,
  verifyAccessToken,
} from "@/lib/middlewareSession";
import { checkRateLimit, getAuthRateLimitRule, getClientIp } from "@/lib/rateLimit";
import { buildPageSecurityHeaders, createCspNonce } from "@/lib/securityHeaders";

function isCustomerFacing(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/menu") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/history") ||
    pathname.startsWith("/orders")
  );
}

function isProtectedApi(pathname: string): boolean {
  return (
    pathname.startsWith("/api/orders") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/staff") ||
    pathname.startsWith("/api/admin")
  );
}

function isProtectedPage(pathname: string): boolean {
  return pathname.startsWith("/staff") || pathname.startsWith("/admin");
}

/** Protects app routes, enforces roles, rotates page sessions, and rate-limits auth mutations. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === "production";
  const pageSecurityHeaders = pathname.startsWith("/api/")
    ? null
    : buildPageSecurityHeaders(pathname, createCspNonce());

  const authRateLimitRule = getAuthRateLimitRule(request.method, pathname);
  if (authRateLimitRule) {
    const result = await checkRateLimit(authRateLimitRule, getClientIp(request));
    if (!result.allowed) {
      return NextResponse.json(
        { error: "Too many requests, please try again later.", code: "TOO_MANY_REQUESTS" },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        },
      );
    }
  }

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const customerFacing = isCustomerFacing(pathname);
  const protectedApi = isProtectedApi(pathname);
  const protectedPage = isProtectedPage(pathname);

  if (!customerFacing && !protectedApi && !protectedPage) {
    return pageSecurityHeaders
      ? buildPageResponse(request, pageSecurityHeaders)
      : NextResponse.next();
  }

  if (protectedApi) {
    const user = await verifyAccessToken(request);
    if (!user) {
      return NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ", code: "UNAUTHORIZED" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        },
      );
    }

    if (
      (pathname.startsWith("/api/staff") || pathname.startsWith("/api/admin")) &&
      !["STAFF", "ADMIN"].includes(user.role)
    ) {
      return NextResponse.json(
        { error: "Không có quyền truy cập", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (pathname.startsWith("/api/admin") && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Chỉ dành cho quản trị viên", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    return buildAuthenticatedResponse(request, user, null, isProduction);
  }

  const { user, cookieUpdates } = await resolveSessionFull(request);
  if (customerFacing) {
    if (user) {
      if (user.role === "ADMIN" || user.role === "STAFF") {
        const url = request.nextUrl.clone();
        url.pathname = "/staff/orders";
        const response = NextResponse.redirect(url);
        if (cookieUpdates) applyCookieUpdates(response, cookieUpdates, isProduction);
        return pageSecurityHeaders
          ? applyPageResponseHeaders(response, pageSecurityHeaders)
          : response;
      }
      return buildAuthenticatedResponse(
        request,
        user,
        cookieUpdates,
        isProduction,
        pageSecurityHeaders ?? undefined,
      );
    }

    const customerProtected =
      pathname.startsWith("/profile") ||
      pathname.startsWith("/history") ||
      pathname.startsWith("/orders");
    if (customerProtected) {
      return redirectToLogin(request, pageSecurityHeaders);
    }
    return pageSecurityHeaders
      ? buildPageResponse(request, pageSecurityHeaders)
      : NextResponse.next();
  }

  if (!user) return redirectToLogin(request, pageSecurityHeaders);

  if (pathname.startsWith("/staff") && !["STAFF", "ADMIN"].includes(user.role)) {
    return redirectWithSecurityHeaders(request, "/", pageSecurityHeaders);
  }
  if (pathname.startsWith("/admin") && user.role !== "ADMIN") {
    const destination = user.role === "STAFF" ? "/staff/orders" : "/";
    return redirectWithSecurityHeaders(request, destination, pageSecurityHeaders);
  }

  return buildAuthenticatedResponse(
    request,
    user,
    cookieUpdates,
    isProduction,
    pageSecurityHeaders ?? undefined,
  );
}

function redirectToLogin(
  request: NextRequest,
  securityHeaders: ReturnType<typeof buildPageSecurityHeaders> | null,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("auth", "login");
  const response = NextResponse.redirect(url);
  return securityHeaders ? applyPageResponseHeaders(response, securityHeaders) : response;
}

function redirectWithSecurityHeaders(
  request: NextRequest,
  pathname: string,
  securityHeaders: ReturnType<typeof buildPageSecurityHeaders> | null,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const response = NextResponse.redirect(url);
  return securityHeaders ? applyPageResponseHeaders(response, securityHeaders) : response;
}

/** Middleware route matcher for pages, protected APIs, and rate-limited auth endpoints. */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.json|.*\\..*).*)",
    "/api/auth/:path*",
    "/api/orders/:path*",
    "/api/profile/:path*",
    "/api/staff/:path*",
    "/staff/:path*",
    "/api/admin/:path*",
    "/admin/:path*",
  ],
};
