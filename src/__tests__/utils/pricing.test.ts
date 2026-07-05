/**
 * Unit tests for src/utils/pricing.ts — pure pricing functions.
 * No mocks needed — all functions are pure (no DB, no side effects).
 */

import { describe, it, expect } from "vitest";
import {
  ceilTo1000,
  resolveGram,
  calcLattePrice,
  calcFusionPrice,
  calcShippingFee,
  calcFreeshipDiscount,
  formatMoney,
  type Size,
  type DefaultSizeConfigEntry,
  type PowderSizeConfigEntry,
  type CustomPowderGrams,
} from "@/src/utils/pricing";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_SIZE_CONFIGS: DefaultSizeConfigEntry[] = [
  { size: "SMALL", milk_ml: 130, powder_gram: 3.5 },
  { size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 },
  { size: "LARGE", milk_ml: 300, powder_gram: 8.0 },
];

const POWDER_SIZE_CONFIGS: PowderSizeConfigEntry[] = [
  { size: "SMALL", grams: 4.0 },
  { size: "MEDIUM", grams: 6.0 },
  // LARGE not defined — should fall back to default
];

// ── ceilTo1000 ────────────────────────────────────────────────────────────────

describe("ceilTo1000", () => {
  it("làm tròn lên 1,000 VND gần nhất — 45001 → 46000", () => {
    expect(ceilTo1000(45001)).toBe(46000);
  });

  it("giữ nguyên nếu đã chẵn 1000 — 45000 → 45000", () => {
    expect(ceilTo1000(45000)).toBe(45000);
  });

  it("làm tròn lên từ 1 VND lẻ — 1 → 1000", () => {
    expect(ceilTo1000(1)).toBe(1000);
  });

  it("0 → 0", () => {
    expect(ceilTo1000(0)).toBe(0);
  });

  it("số âm — -500 → -0 (JS: Math.ceil(-0.5) * 1000 = -0, bằng 0 trong thực tế)", () => {
    // Math.ceil(-0.5) = 0, nhân 1000 = -0 (negative zero JS quirk)
    // Trong thực tế VND không bao giờ âm, nhưng hàm không guard
    expect(ceilTo1000(-500) == 0).toBe(true); // -0 == 0 là true trong JS
  });

  it("số lớn — 999999 → 1000000", () => {
    expect(ceilTo1000(999999)).toBe(1000000);
  });
});

// ── resolveGram — 3-Level COALESCE ────────────────────────────────────────────

describe("resolveGram", () => {
  // Level 3: default size config (system fallback)
  it("dùng default_size_config khi không có custom hay powder config", () => {
    expect(resolveGram("SMALL", null, [], DEFAULT_SIZE_CONFIGS)).toBe(3.5);
    expect(resolveGram("MEDIUM", null, [], DEFAULT_SIZE_CONFIGS)).toBe(4.5);
    expect(resolveGram("LARGE", null, [], DEFAULT_SIZE_CONFIGS)).toBe(8.0);
  });

  // Level 2: powder size config
  it("dùng powder_size_config khi có — override default", () => {
    expect(resolveGram("SMALL", null, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(4.0);
    expect(resolveGram("MEDIUM", null, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(6.0);
  });

  it("powder_size_config thiếu LARGE → fallback sang default (8.0)", () => {
    expect(resolveGram("LARGE", null, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(8.0);
  });

  // Level 1: custom_powder_grams (highest priority)
  it("custom_powder_grams override cả 2 nguồn khác", () => {
    const custom: CustomPowderGrams = { SMALL: 5.0, MEDIUM: 7.0, LARGE: 10.0 };
    expect(resolveGram("SMALL", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(5.0);
    expect(resolveGram("MEDIUM", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(7.0);
    expect(resolveGram("LARGE", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(10.0);
  });

  it("custom_powder_grams partial — chỉ có SMALL → MEDIUM fallback sang powder config, LARGE fallback sang default", () => {
    const custom: CustomPowderGrams = { SMALL: 5.0 };
    expect(resolveGram("SMALL", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(5.0);
    expect(resolveGram("MEDIUM", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(6.0); // powder config
    expect(resolveGram("LARGE", custom, POWDER_SIZE_CONFIGS, DEFAULT_SIZE_CONFIGS)).toBe(8.0); // default
  });

  it("custom_powder_grams = undefined / null → skip Level 1", () => {
    expect(resolveGram("SMALL", undefined, [], DEFAULT_SIZE_CONFIGS)).toBe(3.5);
    expect(resolveGram("SMALL", null, [], DEFAULT_SIZE_CONFIGS)).toBe(3.5);
  });

  it("không có config nào cho size → trả 0", () => {
    expect(resolveGram("LARGE", null, [], [])).toBe(0);
  });

  it("default config dùng field `grams` thay vì `powder_gram` (backward compat)", () => {
    const altDefaults = [{ size: "SMALL" as Size, milk_ml: 130, grams: 3.5 }];
    expect(resolveGram("SMALL", null, [], altDefaults)).toBe(3.5);
  });
});

// ── calcLattePrice ────────────────────────────────────────────────────────────

describe("calcLattePrice", () => {
  it("công thức chuẩn: base + ceil(gram × price_per_gram + milk_ml × milk_price_per_ml, 1000)", () => {
    // 55000 + 4.5 * 6000 + 200 * 40 = 55000 + 27000 + 8000 = 90000
    const price = calcLattePrice({
      base_price_vnd: 55000,
      gram: 4.5,
      powder_price_per_gram: 6000,
      milk_ml: 200,
      milk_price_per_ml: 40,
    });
    expect(price).toBe(90000);
  });

  it("làm tròn lên: 55000 + 3.5 * 6000 + 130 * 40 = 81200 → 82000", () => {
    const price = calcLattePrice({
      base_price_vnd: 55000,
      gram: 3.5,
      powder_price_per_gram: 6000,
      milk_ml: 130,
      milk_price_per_ml: 40,
    });
    // 55000 + 21000 + 5200 = 81200 → ceil to 82000
    expect(price).toBe(82000);
  });

  it("gram = 0 → chỉ base + milk", () => {
    const price = calcLattePrice({
      base_price_vnd: 45000,
      gram: 0,
      powder_price_per_gram: 6000,
      milk_ml: 130,
      milk_price_per_ml: 40,
    });
    // 45000 + 0 + 5200 = 50200 → 51000
    expect(price).toBe(51000);
  });

  it("milk_price_per_ml = 0 → chỉ base + powder", () => {
    const price = calcLattePrice({
      base_price_vnd: 45000,
      gram: 3.5,
      powder_price_per_gram: 6000,
      milk_ml: 130,
      milk_price_per_ml: 0,
    });
    // 45000 + 21000 + 0 = 66000
    expect(price).toBe(66000);
  });

  it("kết quả chẵn 1000 → không thay đổi", () => {
    const price = calcLattePrice({
      base_price_vnd: 50000,
      gram: 5.0,
      powder_price_per_gram: 6000,
      milk_ml: 200,
      milk_price_per_ml: 40,
    });
    // 50000 + 30000 + 8000 = 88000 (exact)
    expect(price).toBe(88000);
  });

  it("milk swap đắt hơn → giá tăng", () => {
    // Default milk: 40/ml, premium milk: 60/ml
    const defaultPrice = calcLattePrice({
      base_price_vnd: 55000,
      gram: 4.5,
      powder_price_per_gram: 6000,
      milk_ml: 200,
      milk_price_per_ml: 40,
    });
    const premiumPrice = calcLattePrice({
      base_price_vnd: 55000,
      gram: 4.5,
      powder_price_per_gram: 6000,
      milk_ml: 200,
      milk_price_per_ml: 60,
    });
    // Default: 90000, Premium: 55000 + 27000 + 12000 = 94000
    expect(premiumPrice).toBeGreaterThan(defaultPrice);
    expect(premiumPrice).toBe(94000);
  });
});

// ── calcFusionPrice ───────────────────────────────────────────────────────────

describe("calcFusionPrice", () => {
  it("công thức chuẩn: ceil(base + gram × price_per_gram + premium_latte, 1000)", () => {
    const price = calcFusionPrice({
      base_price_vnd: 50000,
      gram: 3.5,
      powder_price_per_gram: 6000,
      premium_latte: 0,
    });
    // 50000 + 21000 + 0 = 71000
    expect(price).toBe(71000);
  });

  it("premium_latte > 0 → cộng thêm chênh lệch bột", () => {
    const price = calcFusionPrice({
      base_price_vnd: 50000,
      gram: 3.5,
      powder_price_per_gram: 8000,
      premium_latte: 5000,
    });
    // 50000 + 28000 + 5000 = 83000
    expect(price).toBe(83000);
  });

  it("premium_latte âm (bột rẻ hơn default) → giá giảm", () => {
    const price = calcFusionPrice({
      base_price_vnd: 50000,
      gram: 3.5,
      powder_price_per_gram: 6000,
      premium_latte: -3000,
    });
    // 50000 + 21000 + (-3000) = 68000
    expect(price).toBe(68000);
  });

  it("làm tròn lên: 50000 + 3.5 * 5000 + 0 = 67500 → 68000", () => {
    const price = calcFusionPrice({
      base_price_vnd: 50000,
      gram: 3.5,
      powder_price_per_gram: 5000,
      premium_latte: 0,
    });
    expect(price).toBe(68000);
  });

  it("gram = 0 → chỉ base + premium_latte", () => {
    const price = calcFusionPrice({
      base_price_vnd: 50000,
      gram: 0,
      powder_price_per_gram: 6000,
      premium_latte: 3000,
    });
    // 50000 + 0 + 3000 = 53000
    expect(price).toBe(53000);
  });
});

// ── calcShippingFee ───────────────────────────────────────────────────────────

describe("calcShippingFee", () => {
  it("distance ≤ 0 → phí = 0", () => {
    expect(calcShippingFee(0)).toBe(0);
    expect(calcShippingFee(-1)).toBe(0);
  });

  it("trong base distance (≤ 2km) → base fee × 0.85 ceiled", () => {
    // 15000 × 0.85 = 12750 → ceil to 13000
    expect(calcShippingFee(1)).toBe(13000);
    expect(calcShippingFee(2)).toBe(13000);
  });

  it("vượt base distance → base + extra × per_km, rồi × 0.85", () => {
    // 5km: 15000 + 3 * 5700 = 15000 + 17100 = 32100
    // 32100 * 0.85 = 27285 → ceil to 28000
    expect(calcShippingFee(5)).toBe(28000);
  });

  it("10km → tính chính xác", () => {
    // 15000 + 8 * 5700 = 15000 + 45600 = 60600
    // 60600 * 0.85 = 51510 → ceil to 52000
    expect(calcShippingFee(10)).toBe(52000);
  });
});

// ── calcFreeshipDiscount ──────────────────────────────────────────────────────

describe("calcFreeshipDiscount", () => {
  it("covered ≥ shipping → trả shipping (toàn bộ)", () => {
    expect(calcFreeshipDiscount(20000, 30000)).toBe(20000);
  });

  it("covered < shipping → trả covered (bù một phần)", () => {
    expect(calcFreeshipDiscount(30000, 20000)).toBe(20000);
  });

  it("covered = null → trả 0 (không phải freeship voucher)", () => {
    expect(calcFreeshipDiscount(20000, null)).toBe(0);
  });

  it("shipping = 0 → trả 0 (không có phí ship)", () => {
    expect(calcFreeshipDiscount(0, 30000)).toBe(0);
  });
});

// ── formatMoney ───────────────────────────────────────────────────────────────

describe("formatMoney", () => {
  it("format 45000 → '45.000'", () => {
    expect(formatMoney(45000)).toBe("45.000");
  });

  it("format 0 → '0'", () => {
    expect(formatMoney(0)).toBe("0");
  });

  it("format 1000000 → '1.000.000'", () => {
    expect(formatMoney(1000000)).toBe("1.000.000");
  });
});
