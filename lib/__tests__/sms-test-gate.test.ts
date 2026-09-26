import { afterEach, describe, expect, it, vi } from "vitest";
import { getSmsTestGateStatus, smsTestEnabled } from "@/lib/smsTestGate";

describe("Cổng kiểm thử SMS", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("chỉ mở khi đủ ba điều kiện staging preview và feature flag", () => {
    vi.stubEnv("ABENLA_SMS_TEST_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(smsTestEnabled()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(smsTestEnabled()).toBe(false);
  });

  it("phân biệt biến gate bị thiếu với biến có giá trị không hợp lệ", () => {
    vi.stubEnv("ABENLA_SMS_TEST_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(getSmsTestGateStatus()).toEqual({
      enabled: false,
      missing: [],
      invalid: ["VERCEL_ENV"],
    });

    vi.stubEnv("VERCEL_ENV", "");
    expect(getSmsTestGateStatus()).toEqual({
      enabled: false,
      missing: ["VERCEL_ENV"],
      invalid: [],
    });
  });
});
