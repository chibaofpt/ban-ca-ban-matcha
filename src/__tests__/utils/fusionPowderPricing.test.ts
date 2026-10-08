import { describe, expect, it } from "vitest";
import type { LattePriceAnchors } from "@/contracts/menu";
import { resolveFusionDefaultPowderId } from "@/src/utils/menuConfiguration";
import { calcFusionPrice, calcPremiumLatte } from "@/src/utils/pricing";

const powders = [
  { id: "A", name: "A", price_per_gram: 6_000, is_available: false },
  { id: "B", name: "Meyumi", price_per_gram: 7_000, is_available: true },
  { id: "C", name: "C", price_per_gram: 8_000, is_available: true },
];

describe("Mặc định Fusion do admin cấu hình", () => {
  it("không tự chọn bột khác khi bột gốc inactive và chưa cấu hình thay thế", () => {
    expect(resolveFusionDefaultPowderId("A", powders)).toBeNull();
  });

  it("không tự chọn bột khi thiếu bột gốc", () => {
    expect(resolveFusionDefaultPowderId(null, powders, "B")).toBeNull();
  });

  it("dùng đúng bột thay thế thay vì ưu tiên tên hoặc giá", () => {
    expect(resolveFusionDefaultPowderId("A", powders, "C")).toBe("C");
  });

  it("trở về bột gốc khi bột đó active lại", () => {
    const available = powders.map((powder) => ({ ...powder, is_available: true }));
    expect(resolveFusionDefaultPowderId("A", available, "C")).toBe("A");
  });

  it("không dùng bột thay thế inactive hoặc không tồn tại", () => {
    expect(resolveFusionDefaultPowderId("A", powders, "A")).toBeNull();
    expect(resolveFusionDefaultPowderId("A", powders, "removed")).toBeNull();
  });
});

describe("Premium Fusion luôn neo vào bột gốc", () => {
  const anchors: LattePriceAnchors = {
    A: { MEDIUM: 5_000 },
    B: { MEDIUM: 8_000 },
    C: { MEDIUM: 12_000 },
  };

  it("tính giá 50k, 58k và 66k kể cả bột thay thế mang nhãn mặc định", () => {
    const prices = powders.map((powder) => calcFusionPrice({
      base_price_vnd: 23_000,
      gram: 4.5,
      powder_price_per_gram: powder.price_per_gram,
      premium_latte: calcPremiumLatte(powder.id, "A", "MEDIUM", anchors),
    }));
    expect(prices).toEqual([50_000, 58_000, 66_000]);
    expect(prices[2] - prices[1]).toBe(8_000);
  });

  it("giữ được premium âm và quy tắc thiếu reference hiện có", () => {
    expect(calcPremiumLatte("B", "C", "MEDIUM", anchors)).toBe(-4_000);
    expect(calcPremiumLatte("B", "A", "SMALL", anchors)).toBe(0);
    expect(calcPremiumLatte("B", "A", "MEDIUM", { ...anchors, A: null })).toBe(0);
    expect(calcPremiumLatte("A", "A", "MEDIUM", anchors)).toBe(0);
  });
});
