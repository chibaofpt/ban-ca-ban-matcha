import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { registrationOtpCode, registrationOtpDay, registrationOtpDigest, registrationOtpKey, registrationOtpNamespace } from "@/lib/auth/registrationOtpCrypto";
import {
  checkRegistrationOtpCode, claimRegistrationOtpRequest, finalizeRegistrationOtpRequest,
  registrationOtpCount, registrationOtpProbe, reserveRegistrationOtpSend,
} from "@/lib/auth/registrationOtpStore";
import { OtpRedisFake, otpChallenge, otpEnvironment, reason } from "./registration-otp.fixtures";

const boundary = vi.hoisted(() => ({ redis: null as OtpRedisFake | null }));
vi.mock("@/lib/redis", () => ({ getRegistrationOtpRedisClient: () => boundary.redis }));

describe("Chính sách gửi OTP đăng ký — RATE_LIMIT_POLICY", () => {
  let redis: OtpRedisFake;
  beforeEach(() => {
    otpEnvironment(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    redis = new OtpRedisFake(); boundary.redis = redis;
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  async function send(phone = "+84912345678", ip = "203.0.113.1", limit = 100) {
    const id = randomUUID(), key = registrationOtpKey("request", id);
    await claimRegistrationOtpRequest(key, "bound", otpChallenge(id));
    return reserveRegistrationOtpSend({ key, phone, ip, flow: "browser", payload: "full-payload", challengeId: id, dailyLimit: limit, now: Date.now() });
  }
  const dayKey = () => registrationOtpNamespace() + ":day:" + registrationOtpDay().date;
  it("kiểm tra đủ năm mốc gửi và reset sau bảy ngày từ lần giữ chỗ cuối", async () => {
    const intervals = [120000, 3600000, 18000000, 86400000];
    const first = await send();
    expect(Date.parse(first.resend_at) - Date.now()).toBe(120000);
    for (const delay of intervals) {
      const before = redis.entries.get(registrationOtpKey("cycle", "+84912345678"))!.until;
      vi.setSystemTime(Date.now() + delay - 1);
      await reason(send(), "PHONE_LIMIT");
      expect(redis.entries.get(registrationOtpKey("cycle", "+84912345678"))!.until).toBe(before);
      vi.setSystemTime(Date.now() + 1);
      await send();
    }
    const afterFive = Date.now();
    expect(redis.json(registrationOtpKey("cycle", "+84912345678"))).toEqual({ count: 5, last: afterFive });
    await reason(send("+84912345678", "different-ip"), "PHONE_LIMIT");
    vi.setSystemTime(afterFive + 604800000 - 1);
    await reason(send(), "PHONE_LIMIT");
    vi.setSystemTime(afterFive + 604800000);
    await send();
    expect(redis.json(registrationOtpKey("cycle", "+84912345678"))).toEqual({ count: 1, last: Date.now() });
  });
  it("giới hạn 20 lần giữ chỗ mỗi 600 giây/IP trước mọi ghi hạn mức trả phí", async () => {
    for (let n = 0; n < 20; n++) await send("+849" + String(n).padStart(8, "0"));
    const expiry = redis.entries.get(registrationOtpKey("ip", "203.0.113.1"))!.until;
    await reason(send("+84999999999"), "IP_LIMIT");
    expect(await registrationOtpCount(dayKey())).toBe(20);
    expect(redis.get(registrationOtpKey("cycle", "+84999999999"))).toBeNull();
    expect(redis.entries.get(registrationOtpKey("ip", "203.0.113.1"))!.until).toBe(expiry);
    vi.setSystemTime(expiry);
    await send("+84999999999");
  });
  it("áp dụng hạn mức ngày tại nửa đêm UTC+7, không ghi phone/IP bị từ chối", async () => {
    vi.setSystemTime(new Date("2026-10-03T16:59:59Z"));
    expect(registrationOtpDay()).toEqual({ date: "2026-10-03", ttl: 1 });
    await send("+84911111111", "ip1", 2); await send("+84922222222", "ip2", 2);
    await reason(send("+84933333333", "ip3", 2), "DAILY_LIMIT");
    expect(redis.get(registrationOtpKey("ip", "ip3"))).toBeNull();
    expect(redis.get(registrationOtpKey("cycle", "+84933333333"))).toBeNull();
    vi.setSystemTime(new Date("2026-10-03T17:00:00Z"));
    expect(registrationOtpDay()).toEqual({ date: "2026-10-04", ttl: 86400 });
    await send("+84933333333", "ip3", 2);
    expect(await registrationOtpCount(dayKey())).toBe(1);
  });
  it("replay kết quả checking/unknown/final không tăng hạn mức hoặc TTL, từ chối request khác binding", async () => {
    const id = randomUUID(), key = registrationOtpKey("request", id), data = otpChallenge(id);
    expect(await claimRegistrationOtpRequest(key, "binding", data)).toEqual({ kind: "new" });
    const expiry = redis.entries.get(key)!.until;
    vi.setSystemTime(Date.now() + 1000);
    const replay = await claimRegistrationOtpRequest(key, "binding", otpChallenge());
    expect(replay).toMatchObject({ kind: "replay", outcome: { data: { challenge_id: id, delivery_status: "unknown" } } });
    await reason(claimRegistrationOtpRequest(key, "other-flow", data), "REQUEST_ID_CONFLICT");
    expect(await registrationOtpCount(dayKey())).toBe(0);
    await finalizeRegistrationOtpRequest(key, id, { data: { ...data, delivery_status: "accepted", provider_code: 106 } });
    expect(await claimRegistrationOtpRequest(key, "binding", data)).toMatchObject({ kind: "replay", outcome: { data: { delivery_status: "accepted" } } });
    expect(redis.entries.get(key)!.until).toBe(expiry);
  });
  it("từ chối admission đến muộn sau khi request đã kết thúc, không ghi hạn mức — RATE_LIMIT_POLICY", async () => {
    const id = randomUUID(), key = registrationOtpKey("request", id);
    await claimRegistrationOtpRequest(key, "bound", otpChallenge(id));
    await finalizeRegistrationOtpRequest(key, id, { error: { status: 503, code: "BUSINESS_RULE_VIOLATION", reason: "REGISTRATION_OTP_UNAVAILABLE" } });
    await expect(reserveRegistrationOtpSend({ key, phone: "+84912345678", ip: "ip", flow: "browser", payload: "full-payload", challengeId: id, dailyLimit: 100, now: Date.now() })).rejects.toMatchObject({ status: 503 });
    expect(redis.get(registrationOtpKey("cycle", "+84912345678"))).toBeNull();
    expect(redis.get(registrationOtpKey("ip", "ip"))).toBeNull();
    expect(redis.get(dayKey())).toBeNull();
  });
  it("đếm năm mã sai qua các lần gửi lại, khóa gửi và giữ nguyên cửa sổ sai mã", async () => {
    let challenge = await send();
    const verify = (id = challenge.challenge_id, flow = "browser", payload = "full-payload") => checkRegistrationOtpCode({
      phone: "+84912345678", flow, payload, id, valid: false, token: randomUUID(), attempts: 0,
    });
    expect((await verify())?.counted).toBe(true); await verify();
    const wrongExpiry = redis.entries.get(registrationOtpKey("wrong", "+84912345678"))!.until;
    vi.setSystemTime(Date.now() + 120000); challenge = await send();
    await verify(); await verify();
    const fifth = await verify();
    expect(fifth?.error).toMatchObject({ status: 429, reason: "OTP_LOCKED", retryAt: wrongExpiry });
    const sends = await registrationOtpCount(dayKey());
    await reason(send(), "OTP_LOCKED");
    expect((await verify())?.counted).toBe(false);
    expect(redis.entries.get(registrationOtpKey("wrong", "+84912345678"))!.until).toBe(wrongExpiry);
    expect(await registrationOtpCount(dayKey())).toBe(sends);
    expect((await verify(randomUUID(), "attacker", "changed"))?.error.reason).toBe("OTP_INVALID");
    expect(redis.get(registrationOtpKey("wrong", "+84912345678"))).toBe(5);
  });
  it("chỉ một lượt giữ chỗ thắng khi hai browser cùng số điện thoại — SIMULATED_RACE_OUTCOME", async () => {
    const outcomes = await Promise.allSettled([send(), send("+84912345678", "other-ip")]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await registrationOtpCount(dayKey())).toBe(1);
  });
  it("từ chối khi Redis thiếu hoặc lỗi ở gửi mã, xác nhận, thống kê và số dư", async () => {
    redis.unavailable = true;
    await expect(send()).rejects.toMatchObject({ status: 503 });
    await expect(registrationOtpCount(dayKey())).rejects.toMatchObject({ status: 503 });
    await expect(registrationOtpProbe("admin")).rejects.toMatchObject({ status: 503 });
    boundary.redis = null;
    await expect(claimRegistrationOtpRequest("key", "binding", otpChallenge())).rejects.toMatchObject({ status: 503 });
  });
  it.each([null, false, "oops", {}, NaN, -1])("từ chối scalar Redis thống kê/số dư sai dạng %j thay vì coi là số không", async (value) => {
    vi.spyOn(redis, "eval").mockImplementation(async () => value as never);
    await expect(registrationOtpCount(dayKey())).rejects.toMatchObject({ status: 503 });
    await expect(registrationOtpProbe("admin")).rejects.toMatchObject({ status: 503 });
  });
  it("cho phép mười lần kiểm tra số dư mỗi phút kể cả số dư bằng không", async () => {
    for (let n = 0; n < 10; n++) await registrationOtpProbe("admin");
    await reason(registrationOtpProbe("admin"), "BALANCE_PROBE_LIMIT");
    await registrationOtpProbe("another-admin");
    vi.setSystemTime(Date.now() + 60000);
    await registrationOtpProbe("admin");
  });
  it("băm định danh và tách staging/production cùng phạm vi mã xác nhận", () => {
    const staging = registrationOtpKey("cycle", "+84912345678");
    expect(staging).not.toContain("+84912345678");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(registrationOtpKey("cycle", "+84912345678")).not.toBe(staging);
    const code = registrationOtpCode("id", "phone", "flow", "payload", "123456");
    expect(registrationOtpCode("id", "phone", "other-flow", "payload", "123456")).not.toBe(code);
    expect(registrationOtpCode("old-id", "phone", "flow", "payload", "123456")).not.toBe(code);
    expect(registrationOtpCode("id", "phone", "flow", "changed-payload", "123456")).not.toBe(code);
    expect(registrationOtpDigest("phone", "phone")).not.toBe("phone");
  });
});
