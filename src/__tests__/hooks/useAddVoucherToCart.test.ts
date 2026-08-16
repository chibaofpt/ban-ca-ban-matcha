import { describe, expect, it } from "vitest";
import {
  computeVoucherItemPrice,
  resolveVoucherBaseLiquidId,
} from "@/src/hooks/useAddVoucherToCart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";

const liquids: MilkTypeOption[] = [
  { id: "orange", name: "Nước cam", price_per_ml: 25, is_default: true, display_order: 0 },
  { id: "oat", name: "Sữa yến mạch", price_per_ml: 60, is_default: false, display_order: 1 },
];

const fusion = {
  id: "fusion-1",
  name: "Fusion cam",
  category: "fusion",
  default_base_liquid_id: "orange",
  allowed_base_liquid_ids: ["oat"],
  resolved_default_powder_id: "powder-1",
  custom_powder_grams: null,
  sizes: [{ size: "SMALL", base_price_vnd: 20_000, milk_ml: 200, base_liquid_ml: 200 }],
} as unknown as MenuItem;

describe("PRODUCT voucher add-to-cart Base Liquid", () => {
  it("tính delta Base Liquid cho Fusion giống luồng order", () => {
    const result = computeVoucherItemPrice(
      fusion,
      "SMALL",
      "powder-1",
      "oat",
      [],
      [{ id: "powder-1", price_per_gram: 2_000, size_config: [] }] as never,
      [{ size: "SMALL", grams: 5 }] as never,
      [],
      liquids,
      [],
    );

    expect(result.drinkPrice).toBe(37_000);
  });

  it("chỉ đưa lựa chọn còn thuộc allow-list vào cart", () => {
    expect(resolveVoucherBaseLiquidId(fusion, "oat", liquids)).toBe("oat");
    expect(resolveVoucherBaseLiquidId(fusion, "removed", liquids)).toBe("orange");
  });
});
