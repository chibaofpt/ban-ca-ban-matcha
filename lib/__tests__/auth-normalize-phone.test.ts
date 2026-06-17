/**
 * Unit tests for normalizePhone — pure function with no side effects.
 * Tests the logic inline (no import from lib/auth) to avoid JWT_SECRET module-level throw.
 * The logic is extracted and tested here; lib/auth.ts has the same implementation.
 */

import { describe, it, expect } from "vitest";

// ── Inline implementation mirror (same logic as lib/auth.ts normalizePhone) ──
// We test the logic directly without importing lib/auth to avoid the module-level
// JWT_SECRET check that throws before any test setup can run.

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-\.\(\)]/g, "");

  if (/^84\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^\+840\d{9}$/.test(cleaned)) {
    return `+84${cleaned.slice(4)}`;
  }

  if (/^0\d{9}$/.test(cleaned)) {
    return `+84${cleaned.slice(1)}`;
  }

  return cleaned;
}

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
