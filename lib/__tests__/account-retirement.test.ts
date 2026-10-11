import { describe, expect, it, vi } from "vitest";
vi.hoisted(() => { process.env.JWT_SECRET = "retirement-test-secret-at-least-32-bytes"; });
const limit = vi.hoisted(() => vi.fn().mockResolvedValue({ allowed: true }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) } } }));
vi.mock("@/lib/rateLimit", () => ({ getClientIp: () => "203.0.113.1", checkRateLimits: limit, checkDistributedRateLimit: vi.fn().mockResolvedValue({allowed:true}) }));
import { POST as register } from "@/app/api/auth/register/route";
import { POST as checkPhone } from "@/app/api/auth/check-phone/route";
import { GET as otpConfig, POST as otpSend } from "@/app/api/auth/register/otp/route";
import { POST as google } from "@/app/api/auth/google/route";
import { POST as claimPassword } from "@/app/api/auth/claim/password/route";
import { AccountError, accountErrorResponse } from "@/lib/auth/accountError";
import { accountMutationLimit } from "@/lib/auth/accountHttp";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
describe("Ngừng đăng ký công khai bằng số điện thoại", () => {
  it("ngừng nhận tài khoản bằng mật khẩu và yêu cầu liên kết Google", async () => {
    const response = await claimPassword(new Request("https://matcha.example/api/auth/claim/password", { method: "POST", body: "{}" }));
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", details: { reason: "GOOGLE_CLAIM_REQUIRED" } });
  });
  it("trả 410 cho đăng ký và dò số, hướng dẫn cập nhật ứng dụng", async () => {
    for (const handler of [register, checkPhone]) {
      const response = await handler();
      expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({code:"BUSINESS_RULE_VIOLATION",details:{reason:"CLIENT_UPDATE_REQUIRED"}});
    }
  });
  it("mọi lỗi proof được no-store và không lộ dữ liệu provider", async () => {
    for (const error of [new AccountError("CLAIM_LINK_INVALID", 410, "BUSINESS_RULE_VIOLATION"),
      new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_STORE_UNAVAILABLE"),
      Object.assign(new Error("private-provider-payload"), { code: "P2002" }), new Error("private-provider-payload")]) {
      const response = accountErrorResponse(error);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(JSON.stringify(await response.json())).not.toContain("private-provider-payload");
    }
  });
  it("validation và giới hạn account mutation đều no-store", async () => {
    const request = new Request("https://matcha.example/api/auth/google", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const invalid = await google(request);
    expect(invalid.status).toBe(400); expect(invalid.headers.get("Cache-Control")).toBe("no-store");
    limit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
    const limited = await accountMutationLimit(request);
    expect(limited?.status).toBe(429); expect(limited?.headers.get("Cache-Control")).toBe("no-store"); expect(limited?.headers.get("Retry-After")).toBe("60");
  });
  it("trả 410 cho cấu hình và gửi OTP đăng ký cũ", async () => {
    for (const handler of [otpConfig, otpSend]) {
      const response = await handler();
      expect(response.status).toBe(410);
    }
  });
});
