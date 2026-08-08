import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockTtl = vi.fn();
const mockGetRedisClient = vi.fn();
const mockCaptureServerException = vi.fn();

const fakeRedis = {
  incr: (...args: unknown[]) => mockIncr(...args),
  expire: (...args: unknown[]) => mockExpire(...args),
  ttl: (...args: unknown[]) => mockTtl(...args),
};

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

vi.mock("@/lib/observability", () => ({
  captureServerException: (...args: unknown[]) => mockCaptureServerException(...args),
}));

import {
  aggregateRateLimitResults,
  checkRateLimit,
  getAuthRateLimitRule,
  getClientIp,
  hashRateLimitIdentifier,
} from "@/lib/rateLimit";
import { RATE_LIMIT_RULES } from "@/lib/rateLimitConfig";

describe("Rate limit tập trung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("JWT_SECRET", "test-rate-limit-secret-at-least-32-bytes");
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockTtl.mockResolvedValue(42);
  });

  it("khai báo đầy đủ giới hạn auth và order tại một config chung", () => {
    expect(RATE_LIMIT_RULES.authMutationIp).toMatchObject({ limit: 10, windowSeconds: 60 });
    expect(RATE_LIMIT_RULES.customerOrderUser).toMatchObject({ limit: 5, windowSeconds: 600 });
    expect(RATE_LIMIT_RULES.customerOrderIp).toMatchObject({ limit: 50, windowSeconds: 600 });
    expect(RATE_LIMIT_RULES.staffOrderAccount).toMatchObject({ limit: 30, windowSeconds: 60 });
    expect(RATE_LIMIT_RULES.voucherExchangeAccount).toMatchObject({ limit: 5, windowSeconds: 60 });
    expect(RATE_LIMIT_RULES.pushMutationAccount).toMatchObject({ limit: 20, windowSeconds: 600 });
    expect(RATE_LIMIT_RULES.deliveryAccount).toMatchObject({ limit: 60, windowSeconds: 60 });
    expect(RATE_LIMIT_RULES.deliveryIp).toMatchObject({ limit: 120, windowSeconds: 60 });
  });

  it("gộp mọi limiter và chọn Retry-After lớn nhất một cách ổn định", () => {
    expect(aggregateRateLimitResults([
      { allowed: false, remaining: 0, retryAfterSeconds: 17 },
      { allowed: false, remaining: 0, retryAfterSeconds: 43 },
    ])).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 43 });
  });

  it("ưu tiên IP do Vercel đóng dấu thay vì XFF có thể bị proxy ghi đè", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "203.0.113.8",
      "x-forwarded-for": "198.51.100.1, 192.0.2.9",
    });
    expect(getClientIp({ headers })).toBe("203.0.113.8");
  });

  it("không cho IP giả được chèn đầu XFF xoay rate-limit key", () => {
    const first = getClientIp({ headers: new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }) });
    const rotated = getClientIp({ headers: new Headers({ "x-forwarded-for": "192.0.2.77, 198.51.100.1, 203.0.113.9" }) });
    expect(first).toBe("203.0.113.9");
    expect(rotated).toBe(first);
  });

  it("trả unknown cho chuỗi IP malformed hoặc XFF vượt giới hạn", () => {
    expect(getClientIp({ headers: new Headers({ "x-forwarded-for": "not-an-ip, 203.0.113.9" }) })).toBe("unknown");
    expect(getClientIp({ headers: new Headers({ "x-forwarded-for": Array.from({ length: 21 }, () => "203.0.113.9").join(",") }) })).toBe("unknown");
  });

  it("chỉ map các auth mutation đã duyệt, bỏ qua me và logout", () => {
    expect(getAuthRateLimitRule("POST", "/api/auth/login")).toBe("authMutationIp");
    expect(getAuthRateLimitRule("POST", "/api/auth/register")).toBe("authMutationIp");
    expect(getAuthRateLimitRule("GET", "/api/auth/me")).toBeNull();
    expect(getAuthRateLimitRule("POST", "/api/auth/logout")).toBeNull();
  });

  it("HMAC identifier ổn định nhưng không chứa dữ liệu thô", async () => {
    const first = await hashRateLimitIdentifier("customerOrderUser", "user-secret-id");
    const second = await hashRateLimitIdentifier("customerOrderUser", "user-secret-id");
    const otherScope = await hashRateLimitIdentifier("customerOrderIp", "user-secret-id");

    expect(first).toBe(second);
    expect(first).not.toContain("user-secret-id");
    expect(first).not.toBe(otherScope);
  });

  it("request đầu tiên tạo counter và TTL đúng window", async () => {
    const result = await checkRateLimit("customerOrderUser", "user-1");

    expect(result).toMatchObject({ allowed: true, remaining: 4 });
    expect(mockIncr).toHaveBeenCalledWith(expect.stringMatching(/^rl:v1:order:customer:user:/));
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 600);
    expect(mockTtl).not.toHaveBeenCalled();
  });

  it("không refresh TTL ở mỗi request để tiết kiệm command", async () => {
    mockIncr.mockResolvedValue(2);

    await checkRateLimit("customerOrderUser", "user-1");

    expect(mockExpire).not.toHaveBeenCalled();
  });

  it("trả retryAfterSeconds từ TTL khi vượt giới hạn", async () => {
    mockIncr.mockResolvedValue(6);
    mockTtl.mockResolvedValue(37);

    const result = await checkRateLimit("customerOrderUser", "user-1");

    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 37 });
  });

  it("fail-open và báo Sentry khi Redis lỗi", async () => {
    const error = new Error("Redis unavailable");
    mockIncr.mockRejectedValue(error);

    const result = await checkRateLimit("customerOrderUser", "user-1");

    expect(result.allowed).toBe(true);
    expect(mockCaptureServerException).toHaveBeenCalledWith(error, {
      operation: "rate_limit",
      rule: "customerOrderUser",
    });
  });
});
