import { describe, expect, it } from "vitest";
import {
  calcBaseLiquidDelta,
  calcFusionPrice,
  resolveBaseLiquidMl,
} from "@/src/utils/pricing";
import { getBaseLiquidOptionsForItem } from "@/src/utils/baseLiquid";

const liquids = [
  { id: "bo", name: "Sữa bò", price_per_ml: 40, is_default: true, display_order: 0 },
  { id: "hat", name: "Sữa hạt", price_per_ml: 60, is_default: false, display_order: 1 },
  { id: "cam", name: "Nước cam", price_per_ml: 25, is_default: false, display_order: 2 },
];

describe("Định giá Base Liquid", () => {
  it("dùng định lượng override của món khi đã cấu hình", () => {
    expect(resolveBaseLiquidMl(175, 130)).toBe(175);
  });

  it("fallback về định lượng hệ thống khi override để trống", () => {
    expect(resolveBaseLiquidMl(null, 130)).toBe(130);
  });

  it("tính được chênh lệch tăng và giảm theo ml", () => {
    expect(calcBaseLiquidDelta(200, 60, 40)).toBe(4_000);
    expect(calcBaseLiquidDelta(200, 25, 40)).toBe(-3_000);
  });

  it("Fusion cộng chênh lệch liquid rồi chỉ làm tròn một lần", () => {
    expect(calcFusionPrice({
      base_price_vnd: 30_100,
      gram: 4,
      powder_price_per_gram: 1_000,
      premium_latte: 0,
      base_liquid_delta_vnd: 1_500,
    })).toBe(36_000);
  });
});

describe("Danh sách Base Liquid theo món", () => {
  it("Latte lấy global default và chỉ thêm các liquid được Admin cho phép", () => {
    const options = getBaseLiquidOptionsForItem(
      { category: "latte", default_base_liquid_id: "bo", allowed_base_liquid_ids: ["hat"] },
      liquids,
    );
    expect(options.map((option) => option.id)).toEqual(["bo", "hat"]);
  });

  it("Fusion dùng default riêng và loại bỏ default bị lặp trong allowed", () => {
    const options = getBaseLiquidOptionsForItem(
      { category: "fusion", default_base_liquid_id: "cam", allowed_base_liquid_ids: ["cam", "hat"] },
      liquids,
    );
    expect(options.map((option) => option.id)).toEqual(["cam", "hat"]);
  });

  it("Fusion legacy không có default thì không có lựa chọn swap", () => {
    expect(getBaseLiquidOptionsForItem(
      { category: "fusion", default_base_liquid_id: null, allowed_base_liquid_ids: [] },
      liquids,
    )).toEqual([]);
  });
});
