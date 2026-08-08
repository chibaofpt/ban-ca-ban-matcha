import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.JWT_SECRET = "middleware-test-secret-at-least-32-bytes";
});

const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return {
    ...actual,
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  };
});

vi.mock("@/lib/middleware-auth", () => ({
  findSessionWithUser: vi.fn(),
  deleteSession: vi.fn(),
  createSession: vi.fn(),
  updateSessionGracePeriod: vi.fn(),
  evictSessionCache: vi.fn(),
  markSessionRotating: vi.fn(),
}));

import { middleware } from "@/middleware";

function makeRequest(path: string, method: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99, 203.0.113.7",
    },
  });
}

describe("Middleware rate limit auth mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 0,
    });
  });

  it("rate-limit POST login bằng IP nền tảng tin cậy", async () => {
    const response = await middleware(makeRequest("/api/auth/login", "POST"));

    expect(response.status).toBe(200);
    expect(mockCheckRateLimit).toHaveBeenCalledWith("authMutationIp", "203.0.113.7");
  });

  it("không dùng Redis cho GET me", async () => {
    const response = await middleware(makeRequest("/api/auth/me", "GET"));

    expect(response.status).toBe(200);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("không dùng Redis cho POST logout", async () => {
    const response = await middleware(makeRequest("/api/auth/logout", "POST"));

    expect(response.status).toBe(200);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("trả 429 và Retry-After khi auth mutation vượt giới hạn", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 27,
    });

    const response = await middleware(makeRequest("/api/auth/register", "POST"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("27");
    expect((await response.json()).code).toBe("TOO_MANY_REQUESTS");
  });
});
