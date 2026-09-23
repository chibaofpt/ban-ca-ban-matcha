import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ resolveSession: vi.fn() }));

vi.mock("@/lib/middlewareSession", () => ({
  resolveSessionFull: mocks.resolveSession,
  verifyAccessToken: vi.fn(),
  buildAuthenticatedResponse: vi.fn(() => NextResponse.next()),
  buildPageResponse: vi.fn(() => NextResponse.next()),
  applyCookieUpdates: vi.fn(),
  applyPageResponseHeaders: vi.fn((response: Response) => response),
}));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  getAuthRateLimitRule: vi.fn(() => null),
  getClientIp: vi.fn(() => "203.0.113.1"),
}));
vi.mock("@/lib/securityHeaders", () => ({
  buildPageSecurityHeaders: vi.fn(() => []),
  createCspNonce: vi.fn(() => "test-nonce"),
}));

import { config, middleware } from "@/middleware";

describe("quyền truy cập trang thử SMS", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matcher đưa /test-sms qua middleware", () => {
    expect(config.matcher).toContain("/test-sms");
  });

  it("chuyển người chưa đăng nhập tới đăng nhập", async () => {
    mocks.resolveSession.mockResolvedValueOnce({ user: null, cookieUpdates: null });
    const response = await middleware(new NextRequest("https://example.test/test-sms"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/?auth=login");
  });

  it("chặn nhân viên và cho ADMIN vào trang", async () => {
    mocks.resolveSession.mockResolvedValueOnce({ user: { role: "STAFF" }, cookieUpdates: null });
    const staff = await middleware(new NextRequest("https://example.test/test-sms"));
    expect(staff.status).toBe(307);
    expect(staff.headers.get("location")).toContain("/staff/orders");

    mocks.resolveSession.mockResolvedValueOnce({ user: { role: "ADMIN" }, cookieUpdates: null });
    const admin = await middleware(new NextRequest("https://example.test/test-sms"));
    expect(admin.status).toBe(200);
    expect(admin.headers.get("x-middleware-next")).toBe("1");
  });
});
