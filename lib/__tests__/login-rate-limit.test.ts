/**
 * Unit tests for login rate limiting helpers in lib/rateLimit.ts:
 *  - checkLoginFailLimit   — IP-based fail counter (5 attempts / 15 min)
 *  - recordLoginFail       — increment IP fail counter (wrong password only)
 *  - resetLoginFail        — clear IP fail counter (on successful login)
 *  - checkPhoneFloodGuard  — phone-based flood guard (10 attempts / 15 min)
 *  - recordPhoneFloodAttempt — increment phone flood counter
 *  - resetPhoneFlood       — clear phone flood counter
 *
 * Strategy: mock lib/redis getRedisClient — test all threshold / fail-open branches.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (khai báo TRƯỚC import) ──────────────────────────────────────────────

const mockGet = vi.fn();
const mockIncr = vi.fn();
const mockExpire = vi.fn();
const mockDel = vi.fn();

/** Reusable fake Redis client */
const fakeRedis = {
  get: (...args: unknown[]) => mockGet(...args),
  incr: (...args: unknown[]) => mockIncr(...args),
  expire: (...args: unknown[]) => mockExpire(...args),
  del: (...args: unknown[]) => mockDel(...args),
};

const mockGetRedisClient = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => mockGetRedisClient(),
}));

// ── Import SAU mock ───────────────────────────────────────────────────────────

import {
  checkLoginFailLimit,
  recordLoginFail,
  resetLoginFail,
  checkPhoneFloodGuard,
  recordPhoneFloodAttempt,
  resetPhoneFlood,
} from "@/lib/rateLimit";

// ══════════════════════════════════════════════════════════════════════════════
// checkLoginFailLimit — kiểm tra IP fail counter
// ══════════════════════════════════════════════════════════════════════════════

describe("checkLoginFailLimit — kiểm tra IP fail counter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(fakeRedis);
  });

  it("trả { allowed: true } khi counter chưa đạt ngưỡng", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(3); // 3 < 5

    const result = await checkLoginFailLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - 3
  });

  it("trả { allowed: false } khi counter đạt đúng 5", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(5);

    const result = await checkLoginFailLimit("1.2.3.4");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("trả { allowed: false } khi counter vượt quá 5", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(6);

    const result = await checkLoginFailLimit("1.2.3.4");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("trả { allowed: true } khi Redis down (fail-open)", async () => {
    mockGetRedisClient.mockReturnValue(null);

    const result = await checkLoginFailLimit("1.2.3.4");

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(-1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// checkPhoneFloodGuard — kiểm tra phone flood counter
// ══════════════════════════════════════════════════════════════════════════════

describe("checkPhoneFloodGuard — kiểm tra phone flood counter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(fakeRedis);
  });

  it("trả { allowed: true } khi counter chưa đạt ngưỡng", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(9); // 9 < 10

    const result = await checkPhoneFloodGuard("+84912345678");

    expect(result.allowed).toBe(true);
  });

  it("trả { allowed: false } khi counter đạt đúng 10", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(10);

    const result = await checkPhoneFloodGuard("+84912345678");

    expect(result.allowed).toBe(false);
  });

  it("trả { allowed: false } khi counter vượt quá 10", async () => {
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockGet.mockResolvedValueOnce(12);

    const result = await checkPhoneFloodGuard("+84912345678");

    expect(result.allowed).toBe(false);
  });

  it("trả { allowed: true } khi Redis down (fail-open)", async () => {
    mockGetRedisClient.mockReturnValue(null);

    const result = await checkPhoneFloodGuard("+84912345678");

    expect(result.allowed).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// recordLoginFail + resetLoginFail
// ══════════════════════════════════════════════════════════════════════════════

describe("recordLoginFail + resetLoginFail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockDel.mockResolvedValue(1);
  });

  it("recordLoginFail gọi Redis incr + expire với đúng key và TTL 900s", async () => {
    await recordLoginFail("1.2.3.4");

    expect(mockIncr).toHaveBeenCalledWith("login:fail:1.2.3.4");
    expect(mockExpire).toHaveBeenCalledWith("login:fail:1.2.3.4", 900);
  });

  it("resetLoginFail gọi Redis del với đúng key", async () => {
    await resetLoginFail("1.2.3.4");

    expect(mockDel).toHaveBeenCalledWith("login:fail:1.2.3.4");
  });

  it("không throw khi Redis down", async () => {
    mockGetRedisClient.mockReturnValue(null);

    await expect(recordLoginFail("1.2.3.4")).resolves.not.toThrow();
    await expect(resetLoginFail("1.2.3.4")).resolves.not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// recordPhoneFloodAttempt + resetPhoneFlood
// ══════════════════════════════════════════════════════════════════════════════

describe("recordPhoneFloodAttempt + resetPhoneFlood", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisClient.mockReturnValue(fakeRedis);
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);
    mockDel.mockResolvedValue(1);
  });

  it("recordPhoneFloodAttempt gọi Redis incr + expire với đúng key và TTL 900s", async () => {
    await recordPhoneFloodAttempt("+84912345678");

    expect(mockIncr).toHaveBeenCalledWith("login:phone:+84912345678");
    expect(mockExpire).toHaveBeenCalledWith("login:phone:+84912345678", 900);
  });

  it("resetPhoneFlood gọi Redis del với đúng key", async () => {
    await resetPhoneFlood("+84912345678");

    expect(mockDel).toHaveBeenCalledWith("login:phone:+84912345678");
  });

  it("không throw khi Redis down", async () => {
    mockGetRedisClient.mockReturnValue(null);

    await expect(recordPhoneFloodAttempt("+84912345678")).resolves.not.toThrow();
    await expect(resetPhoneFlood("+84912345678")).resolves.not.toThrow();
  });
});
