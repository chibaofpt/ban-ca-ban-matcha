import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Gỡ công cụ OTP thử nghiệm — STATIC_ARTIFACT", () => {
  it.each([
    "app/(admin-shell)/test-sms/page.tsx",
    "app/api/admin/sms-test/connection/route.ts",
    "app/api/admin/sms-test/balance/route.ts",
    "app/api/admin/sms-test/send-otp/route.ts",
    "app/api/admin/sms-test/verify-otp/route.ts",
    "src/views/admin/SmsTestPage.tsx",
    "src/services/smsTestService.ts",
    "lib/sms/smsTest.ts",
    "lib/sms/smsTestStore.ts",
    "lib/sms/smsTestHttp.ts",
    "lib/sms/smsTestGate.ts",
    "lib/validations/smsTest.ts",
    "contracts/smsTest.ts",
  ])("không còn entry point hoặc helper của tool %s", (file) => {
    expect(existsSync(file)).toBe(false);
  });

  it("env template không còn cấu hình tool và hostname allowlist riêng", () => {
    const template = readFileSync(".env.local.example", "utf8");
    expect(template).not.toMatch(/SMS_TEST_OTP_SECRET|ABENLA_SMS_TEST_ENABLED|TURNSTILE_ALLOWED_HOSTNAMES/);
    expect(template).toContain("REGISTRATION_OTP_SECRET=");
    expect(template).toContain("ABENLA_LOGIN_NAME=");
  });
});
