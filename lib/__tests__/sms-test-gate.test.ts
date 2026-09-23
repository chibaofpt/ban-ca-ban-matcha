import { afterEach, describe, expect, it, vi } from "vitest";
import { smsTestEnabled } from "@/lib/smsTestGate";

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
});
