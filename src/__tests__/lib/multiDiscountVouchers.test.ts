/**
 * Tests for `calcMultiDiscountVouchers` — the new multi-DISCOUNT stacking function.
 *
 * Rules (confirmed via grill-me):
 *  - Nhiều FIXED cùng lúc: OK — trừ lần lượt trên subtotal còn lại
 *  - Tối đa 1 PERCENT: OK — nhưng chỉ 1 (route-level validation)
 *  - Thứ tự: tất cả FIXED trước → PERCENT áp trên số còn lại
 *  - Total >= 0đ (không âm)
 *
 * These tests will FAIL until `calcMultiDiscountVouchers` is added to `lib/vouchers.ts`.
 */

import { describe, it, expect } from "vitest";

// ── Import the function to be implemented ─────────────────────────────────────
// This import will fail until the function is added to lib/vouchers.ts
import { calcMultiDiscountVouchers } from "@/lib/vouchers";

// ── Fixture helper ─────────────────────────────────────────────────────────────

type DiscountVoucher = {
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
};

function fixed(value: number): DiscountVoucher {
  return { discount_type: "FIXED", discount_value: value };
}

function percent(value: number): DiscountVoucher {
  return { discount_type: "PERCENT", discount_value: value };
}

// ── Empty / no vouchers ───────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — empty input", () => {
  it("mảng rỗng → discount = 0", () => {
    expect(calcMultiDiscountVouchers([], 100_000)).toBe(0);
  });

  it("mảng rỗng, subtotal = 0 → discount = 0", () => {
    expect(calcMultiDiscountVouchers([], 0)).toBe(0);
  });
});

// ── Single FIXED ──────────────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — single FIXED", () => {
  it("1 FIXED 20K trên subtotal 100K → discount = 20K", () => {
    expect(calcMultiDiscountVouchers([fixed(20_000)], 100_000)).toBe(20_000);
  });

  it("1 FIXED 200K trên subtotal 80K → discount = 80K (không âm)", () => {
    expect(calcMultiDiscountVouchers([fixed(200_000)], 80_000)).toBe(80_000);
  });

  it("1 FIXED 0 → discount = 0", () => {
    expect(calcMultiDiscountVouchers([fixed(0)], 100_000)).toBe(0);
  });
});

// ── Multiple FIXED ────────────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — nhiều FIXED", () => {
  it("2 FIXED (10K + 15K) trên 100K → discount = 25K", () => {
    expect(calcMultiDiscountVouchers([fixed(10_000), fixed(15_000)], 100_000)).toBe(25_000);
  });

  it("3 FIXED (10K + 20K + 30K) trên 100K → discount = 60K", () => {
    expect(
      calcMultiDiscountVouchers([fixed(10_000), fixed(20_000), fixed(30_000)], 100_000)
    ).toBe(60_000);
  });

  it("tổng FIXED lớn hơn subtotal → discount = subtotal (không âm)", () => {
    // 20K + 30K = 50K, nhưng subtotal chỉ có 40K
    expect(calcMultiDiscountVouchers([fixed(20_000), fixed(30_000)], 40_000)).toBe(40_000);
  });

  it("FIXED trừ lần lượt — không phải cộng tổng rồi mới trừ (kết quả đều như nhau trừ edge case âm)", () => {
    // 100K - 20K = 80K, 80K - 30K = 50K → discount = 50K
    expect(calcMultiDiscountVouchers([fixed(20_000), fixed(30_000)], 100_000)).toBe(50_000);
  });
});

// ── Single PERCENT ────────────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — single PERCENT", () => {
  it("1 PERCENT 10% trên 100K → discount = 10K", () => {
    expect(calcMultiDiscountVouchers([percent(10)], 100_000)).toBe(10_000);
  });

  it("1 PERCENT 20% trên 55K → discount = 11K", () => {
    expect(calcMultiDiscountVouchers([percent(20)], 55_000)).toBe(11_000);
  });

  it("1 PERCENT 100% → discount = subtotal (hết sạch)", () => {
    expect(calcMultiDiscountVouchers([percent(100)], 80_000)).toBe(80_000);
  });

  it("1 PERCENT 15% trên 70K → floor(70000 * 0.15) = 10500", () => {
    expect(calcMultiDiscountVouchers([percent(15)], 70_000)).toBe(10_500);
  });
});

// ── Mixed FIXED + PERCENT ─────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — FIXED trước, PERCENT sau", () => {
  it("1 FIXED 20K + 1 PERCENT 10% trên 100K → (100K-20K)×10% = 8K → total discount = 28K", () => {
    // 100K - 20K = 80K → 80K * 10% = 8K → total discount = 20K + 8K = 28K
    expect(calcMultiDiscountVouchers([fixed(20_000), percent(10)], 100_000)).toBe(28_000);
  });

  it("2 FIXED (10K+15K) + 1 PERCENT 15% trên 100K → đúng thứ tự", () => {
    // Step 1: 100K - 10K = 90K, 90K - 15K = 75K
    // Step 2: 75K * 15% = 11250
    // total discount = 25K + 11250 = 36250
    expect(
      calcMultiDiscountVouchers([fixed(10_000), fixed(15_000), percent(15)], 100_000)
    ).toBe(36_250);
  });

  it("FIXED sau khi trừ còn lại 0 → PERCENT không tạo thêm discount", () => {
    // FIXED 200K trên 50K → remaining = 0 → PERCENT 20% trên 0 = 0 → total = 50K
    expect(calcMultiDiscountVouchers([fixed(200_000), percent(20)], 50_000)).toBe(50_000);
  });

  it("kết quả: subtotal - result >= 0 (không bao giờ âm)", () => {
    const subtotal = 30_000;
    const discount = calcMultiDiscountVouchers([fixed(50_000), percent(50)], subtotal);
    expect(subtotal - discount).toBeGreaterThanOrEqual(0);
  });

  it("ví dụ thực tế từ plan: 100K - 20K - 10K = 70K → 70K×15% = 10.5K → total = 40.5K", () => {
    // 100K - 20K = 80K, 80K - 10K = 70K → 70K * 15% = 10500 → total discount = 40500
    expect(
      calcMultiDiscountVouchers([fixed(20_000), fixed(10_000), percent(15)], 100_000)
    ).toBe(40_500);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("calcMultiDiscountVouchers — edge cases", () => {
  it("voucher với discount_value = null → bỏ qua", () => {
    const nullVoucher: DiscountVoucher = { discount_type: "FIXED", discount_value: null };
    expect(calcMultiDiscountVouchers([nullVoucher], 100_000)).toBe(0);
  });

  it("voucher với discount_type = null → bỏ qua", () => {
    const nullType: DiscountVoucher = { discount_type: null, discount_value: 10 };
    expect(calcMultiDiscountVouchers([nullType], 100_000)).toBe(0);
  });

  it("subtotal = 0 với bất kỳ vouchers → discount = 0", () => {
    expect(
      calcMultiDiscountVouchers([fixed(20_000), percent(10)], 0)
    ).toBe(0);
  });

  it("chỉ PERCENT, không có FIXED → chỉ áp PERCENT trực tiếp trên subtotal", () => {
    expect(calcMultiDiscountVouchers([percent(20)], 100_000)).toBe(20_000);
  });
});
