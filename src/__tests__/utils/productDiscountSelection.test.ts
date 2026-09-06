import { describe, expect, it } from "vitest";
import type { MenuItem } from "@/src/lib/types/menu";
import { getEligibleProductDiscountItems } from "@/src/utils/customerVoucherSelection";

const item = (id: string, sizes: MenuItem["sizes"]): MenuItem => ({
  id,
  name: id,
  description: null,
  category: "latte",
  image_url: null,
  is_seasonal: false,
  sort_order: 0,
  base_liquid_note: null,
  custom_powder_grams: null,
  powder: null,
  resolved_default_powder_id: null,
  allowed_powder_ids: [],
  sizes,
});

describe("getEligibleProductDiscountItems", () => {
  it("intersects voucher sizes with each eligible item's sellable sizes", () => {
    const result = getEligibleProductDiscountItems(
      [
        item("latte-a", [
          { size: "SMALL", base_price_vnd: 45_000, milk_ml: 120 },
          { size: "LARGE", base_price_vnd: 60_000, milk_ml: 180 },
        ]),
        item("latte-b", [
          { size: "SMALL", base_price_vnd: 40_000, milk_ml: 120 },
        ]),
      ],
      [
        { menu_item_id: "latte-a", is_available: true },
        { menu_item_id: "latte-b", is_available: true },
      ],
      null,
      ["MEDIUM", "LARGE"],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.item.id).toBe("latte-a");
    expect(result[0]?.allowedSizes).toEqual(["LARGE"]);
  });

  it("uses the legacy anchor only when an explicit eligible scope is absent", () => {
    const legacy = item("legacy", [
      { size: "MEDIUM", base_price_vnd: 50_000, milk_ml: 150 },
    ]);

    expect(getEligibleProductDiscountItems([legacy], undefined, "legacy", ["MEDIUM"]))
      .toEqual([{ item: legacy, allowedSizes: ["MEDIUM"] }]);
    expect(getEligibleProductDiscountItems(
      [legacy],
      [{ menu_item_id: "legacy", is_available: false }],
      "legacy",
      ["MEDIUM"],
    )).toEqual([]);
  });

  it("rejects a scoped item when no voucher size is sellable", () => {
    const legacy = item("legacy", [
      { size: "SMALL", base_price_vnd: 40_000, milk_ml: 120 },
    ]);

    expect(getEligibleProductDiscountItems(
      [legacy],
      [{ menu_item_id: "legacy", is_available: true }],
      null,
      ["LARGE"],
    )).toEqual([]);
  });
});
