import { describe, it, expect } from "vitest";
import type { MenuItem, AddonGroup } from "@/src/lib/types/menu";

// ── Pure price calculation logic mirroring AddonModal ───────────────────────

/** Mirror calcUnitPrice logic từ AddonModal */
function calcUnitPrice(
  item: MenuItem,
  addonGroups: AddonGroup[],
  selectedSize: "SMALL" | "MEDIUM" | "LARGE",
  selectedOptionIds: string[],
  quantityMap: Record<string, number>
): number {
  // Phase 2: all items use base_price_vnd from sizes
  const base = item.sizes.find((s) => s.size === selectedSize)?.base_price_vnd ?? 0;

  const addonsCost = addonGroups
    .flatMap((g) => {
      if (g.type === "QUANTITY") {
        const qty = quantityMap[g.id] ?? 0;
        return qty > 0 ? [qty * (g.options[0]?.price_vnd ?? 0)] : [];
      }
      return g.options
        .filter((o) => selectedOptionIds.includes(o.id))
        .map((o) => o.price_vnd);
    })
    .reduce((s, v) => s + v, 0);

  return base + addonsCost;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const quantityGroup: AddonGroup = {
  id: "grp-powder",
  name: "Extra Powder",
  type: "QUANTITY",
  is_required: false,
  min_quantity: 0,
  max_quantity: 3,
  options: [
    {
      id: "opt-powder",
      label: "Bột matcha",
      price_vnd: 5000,
      gram_value: null,
      is_default: false,
      sort_order: 0,
    },
  ],
};

const selectorGroup: AddonGroup = {
  id: "grp-milk",
  name: "Loại sữa",
  type: "SELECTOR",
  is_required: true,
  min_quantity: null,
  max_quantity: null,
  options: [
    { id: "opt-cow", label: "Sữa bò", price_vnd: 0, gram_value: null, is_default: true, sort_order: 0 },
    { id: "opt-oat", label: "Sữa Oat", price_vnd: 10000, gram_value: null, is_default: false, sort_order: 1 },
  ],
};

const latteItem: MenuItem = {
  id: "item-matcha",
  name: "Matcha Latte",
  description: null,
  category: "latte",
  is_seasonal: false,
  image_url: null,
  sort_order: 0,
  base_liquid_note: null,
  custom_powder_grams: null,
  powder: { id: "powder-1", name: "Meyumi", type: "RECOMMEND" },
  resolved_default_powder_id: null,
  allowed_powder_ids: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 45000, milk_ml: 180 },
    { size: "MEDIUM", base_price_vnd: 55000, milk_ml: 220 },
    { size: "LARGE", base_price_vnd: 65000, milk_ml: 260 },
  ],
};

const fusionItem: MenuItem = {
  id: "item-cam",
  name: "Matcha Cam",
  description: null,
  category: "fusion",
  is_seasonal: false,
  image_url: null,
  sort_order: 1,
  base_liquid_note: "Nước ép cam",
  custom_powder_grams: null,
  powder: null,
  resolved_default_powder_id: "powder-1",
  allowed_powder_ids: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 55000, milk_ml: 0 },
    { size: "MEDIUM", base_price_vnd: 65000, milk_ml: 0 },
    { size: "LARGE", base_price_vnd: 75000, milk_ml: 0 },
  ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("calcUnitPrice — latte item", () => {
  it("default size MEDIUM, không addon → 55000", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], {})).toBe(55000);
  });

  it("size SMALL → 45000", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "SMALL", ["opt-cow"], {})).toBe(45000);
  });

  it("size LARGE + sữa Oat → 65000 + 10000 = 75000", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "LARGE", ["opt-oat"], {})).toBe(75000);
  });

  it("size MEDIUM + 2g bột → 55000 + 2×5000 = 65000", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], { "grp-powder": 2 })).toBe(65000);
  });

  it("size MEDIUM + 3g bột (max) + sữa Oat → 55000 + 15000 + 10000 = 80000", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-oat"], { "grp-powder": 3 })).toBe(80000);
  });

  it("bột qty = 0 → không tính addon cost", () => {
    expect(calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], { "grp-powder": 0 })).toBe(55000);
  });
});

describe("calcUnitPrice — fusion item", () => {
  it("không addon → 65000 (MEDIUM)", () => {
    expect(calcUnitPrice(fusionItem, [selectorGroup], "MEDIUM", ["opt-cow"], {})).toBe(65000);
  });

  it("sữa Oat → 65000 + 10000 = 75000", () => {
    expect(calcUnitPrice(fusionItem, [selectorGroup], "MEDIUM", ["opt-oat"], {})).toBe(75000);
  });

  it("size SMALL fusion → 55000", () => {
    expect(calcUnitPrice(fusionItem, [selectorGroup], "SMALL", ["opt-cow"], {})).toBe(55000);
  });
});

describe("QUANTITY addon logic", () => {
  it("chỉ tính qty > 0", () => {
    const withZero = calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], { "grp-powder": 0 });
    const withOne = calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], { "grp-powder": 1 });
    expect(withOne - withZero).toBe(5000);
  });

  it("group không có trong quantityMap → bỏ qua (không crash)", () => {
    expect(() => calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], {})).not.toThrow();
  });
});

describe("SELECTOR addon logic", () => {
  it("chọn sữa Oat thay sữa bò → chỉ tính 1 option", () => {
    const priceWithOat = calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-oat"], {});
    const priceWithCow = calcUnitPrice(latteItem, [selectorGroup, quantityGroup], "MEDIUM", ["opt-cow"], {});
    expect(priceWithOat - priceWithCow).toBe(10000);
  });
});
