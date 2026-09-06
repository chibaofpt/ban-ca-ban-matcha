import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("JWT_SECRET", "normalize-phone-test-secret-at-least-32-bytes");
const { normalizePhone } = await import("@/lib/auth");

afterAll(() => vi.unstubAllEnvs());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("normalizePhone — xử lý các format số điện thoại Việt Nam", () => {
  it("chuẩn hoá 0xxxxxxxxx → +84xxxxxxxxx (format chuẩn Việt Nam)", () => {
    expect(normalizePhone("0912345678")).toBe("+84912345678");
  });

  it("giữ nguyên +84xxxxxxxxx (đã chuẩn hoá)", () => {
    expect(normalizePhone("+84912345678")).toBe("+84912345678");
  });

  it("xử lý 84xxxxxxxxx (11 số, thiếu dấu +)", () => {
    expect(normalizePhone("84912345678")).toBe("+84912345678");
  });

  it("xử lý khoảng trắng trong số điện thoại (091 234 5678)", () => {
    expect(normalizePhone("091 234 5678")).toBe("+84912345678");
  });

  it("xử lý dấu gạch trong số điện thoại (091-234-5678)", () => {
    expect(normalizePhone("091-234-5678")).toBe("+84912345678");
  });

  it("xử lý +840xxxxxxxxx (dư số 0 sau country code)", () => {
    expect(normalizePhone("+840912345678")).toBe("+84912345678");
  });

  it("giữ nguyên format không match rule nào (pass-through)", () => {
    expect(normalizePhone("1234567890")).toBe("1234567890");
  });
});
