import { afterEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ construct: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { constructor(config: unknown) { boundary.construct(config); } } }));
afterEach(() => { vi.resetModules(); vi.unstubAllEnvs(); boundary.construct.mockClear(); });
describe("transport Redis dành riêng cho OTP — APPLICATION_LOGIC", () => {
  it("thiếu Redis env trả unavailable mà không khởi tạo SDK", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { getRegistrationOtpRedisClient } = await import("@/lib/redis");
    expect(getRegistrationOtpRedisClient()).toBeNull();
    expect(boundary.construct).not.toHaveBeenCalled();
  });
  it("client OTP riêng không đổi cấu hình client cache hoặc security limiter", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "unit-test-token");
    const { getRegistrationOtpRedisClient, getRedisClient } = await import("@/lib/redis");
    const regular = getRedisClient(), otp = getRegistrationOtpRedisClient();
    expect(otp).not.toBe(regular);
    expect(getRegistrationOtpRedisClient()).toBe(otp);
    expect(boundary.construct).toHaveBeenCalledTimes(2);
    expect(boundary.construct.mock.calls[0][0]).toEqual({ url: "https://redis.test.invalid", token: "unit-test-token" });
  });
  it("khởi tạo client có timeout từng lần gọi và không tự thử lại", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.test.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "unit-test-token");
    const adapter = await import("@/lib/redis") as { getRegistrationOtpRedisClient?: () => unknown };
    expect(adapter.getRegistrationOtpRedisClient).toBeTypeOf("function");
    adapter.getRegistrationOtpRedisClient?.();
    expect(boundary.construct).toHaveBeenCalledWith(expect.objectContaining({
      retry: { retries: 0 }, enableAutoPipelining: false, signal: expect.any(Function),
    }));
    const config = boundary.construct.mock.calls[0][0] as { signal: () => AbortSignal };
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const first = config.signal(), second = config.signal();
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(first).not.toBe(second);
    timeout.mockRestore();
  });
});
