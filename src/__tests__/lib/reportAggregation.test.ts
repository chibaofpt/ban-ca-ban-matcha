import { describe, it, expect } from "vitest";
import {
  resolveEffectiveGram,
  buildReport,
  type RawOrder,
  type PowderConfig,
  type PowderSizeEntry,
  type DefaultSizeEntry,
  type MilkConfig,
} from "@/lib/reportAggregation";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const defaultSizes: DefaultSizeEntry[] = [
  { size: "M", milk_ml: 130, powder_gram: 3.5 },
  { size: "L", milk_ml: 200, powder_gram: 4.5 },
  { size: "XL", milk_ml: 300, powder_gram: 8.0 },
];

const powders: PowderConfig[] = [
  { id: "powder-meyumi", name: "Meyumi" },
  { id: "powder-hana", name: "Hana" },
];

const milkTypes: MilkConfig[] = [
  { id: "milk-bo", name: "Sữa bò" },
  { id: "milk-oat", name: "Sữa yến mạch" },
];

/** No per-powder size overrides */
const noPowderSizes: PowderSizeEntry[] = [];

/** Meyumi has a custom 5g for M, 6g for L */
const meyumiPowderSizes: PowderSizeEntry[] = [
  { powder_id: "powder-meyumi", size: "M", grams: 5 },
  { powder_id: "powder-meyumi", size: "L", grams: 6 },
];

// ---------------------------------------------------------------------------
// resolveEffectiveGram
// ---------------------------------------------------------------------------

describe("resolveEffectiveGram", () => {
  describe("Level 3 — default_size_config fallback", () => {
    it("returns default powder_gram when no custom_powder_grams and no powder_size_config", () => {
      const item = {
        size: "M" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, noPowderSizes, defaultSizes);
      expect(result).toBe(3.5); // defaultSizes M
    });

    it("returns correct default for size L", () => {
      const item = {
        size: "L" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, noPowderSizes, defaultSizes);
      expect(result).toBe(4.5);
    });

    it("returns correct default for size XL", () => {
      const item = {
        size: "XL" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, noPowderSizes, defaultSizes);
      expect(result).toBe(8.0);
    });
  });

  describe("Level 2 — powder_size_config override", () => {
    it("uses powder_size_config when available, overriding default", () => {
      const item = {
        size: "M" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(5); // powder_size_config override
    });

    it("falls back to default when powder_size_config exists for other powder but not this one", () => {
      const item = {
        size: "M" as const,
        selected_powder_id: "powder-hana",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-hana",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(3.5); // default fallback (hana has no override)
    });

    it("falls back to default for size XL even when powder has M/L overrides", () => {
      const item = {
        size: "XL" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      // meyumiPowderSizes only has M and L overrides
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(8.0); // default XL
    });
  });

  describe("Level 1 — custom_powder_grams (highest priority)", () => {
    it("uses custom_powder_grams when present, overriding both level 2 and 3", () => {
      const item = {
        size: "M" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: { M: 7, L: 9, XL: 12 },
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(7); // custom wins
    });

    it("uses custom_powder_grams for L size", () => {
      const item = {
        size: "L" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: { M: 7, L: 9, XL: 12 },
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(9);
    });

    it("falls through to level 2 if custom_powder_grams exists but missing the size", () => {
      const item = {
        size: "XL" as const,
        selected_powder_id: "powder-meyumi",
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: { M: 7 }, // only M defined
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      // XL not in custom → fall to powder_size_config (meyumi has no XL) → default 8.0
      expect(result).toBe(8.0);
    });
  });

  describe("Powder ID resolution", () => {
    it("uses selected_powder_id when set (fusion scenario)", () => {
      // Fusion item: selected_powder_id may differ from matcha_powder_id
      const item = {
        size: "M" as const,
        selected_powder_id: "powder-meyumi", // customer chose meyumi
        menuItem: {
          name: "Test Fusion",
          category: "fusion",
          matcha_powder_id: null,
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(5); // meyumi size M override
    });

    it("falls back to matcha_powder_id when selected_powder_id is null", () => {
      // Latte item: selected_powder_id is null, use matcha_powder_id
      const item = {
        size: "M" as const,
        selected_powder_id: null,
        menuItem: {
          name: "Test Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, meyumiPowderSizes, defaultSizes);
      expect(result).toBe(5); // meyumi override for M
    });

    it("returns 0 when both selected_powder_id and matcha_powder_id are null", () => {
      const item = {
        size: "M" as const,
        selected_powder_id: null,
        menuItem: {
          name: "No Powder Item",
          category: "fusion",
          matcha_powder_id: null,
          custom_powder_grams: null,
        },
      };
      const result = resolveEffectiveGram(item, noPowderSizes, defaultSizes);
      expect(result).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

describe("buildReport", () => {
  /** A minimal completed latte order: 1 ly Meyumi M, sữa bò, qty=1, no extra matcha */
  const singleLatteMOrder: RawOrder = {
    total_vnd: 55000,
    items: [
      {
        menu_item_id: "item-latte-1",
        quantity: 1,
        size: "M",
        selected_powder_id: null, // latte: server resolves, null here
        selected_milk_type_id: "milk-bo",
        menuItem: {
          name: "Premium Matcha Latte",
          category: "latte",
          matcha_powder_id: "powder-meyumi",
          custom_powder_grams: null,
        },
        addons: [],
      },
    ],
  };

  describe("summary", () => {
    it("counts total_orders correctly", () => {
      const report = buildReport(
        [singleLatteMOrder, singleLatteMOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.summary.total_orders).toBe(2);
    });

    it("sums total_revenue_vnd from all orders", () => {
      const order2: RawOrder = { total_vnd: 70000, items: [] };
      const report = buildReport(
        [singleLatteMOrder, order2],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.summary.total_revenue_vnd).toBe(125000);
    });

    it("counts total_cups multiplied by quantity", () => {
      const order: RawOrder = {
        total_vnd: 110000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 3, // 3 cups
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport([order], powders, milkTypes, noPowderSizes, defaultSizes);
      expect(report.summary.total_cups).toBe(3);
    });

    it("returns zeros for empty orders", () => {
      const report = buildReport([], powders, milkTypes, noPowderSizes, defaultSizes);
      expect(report.summary.total_orders).toBe(0);
      expect(report.summary.total_cups).toBe(0);
      expect(report.summary.total_revenue_vnd).toBe(0);
    });
  });

  describe("powder_usage", () => {
    it("aggregates gram for a single latte item using matcha_powder_id + default size config", () => {
      const report = buildReport(
        [singleLatteMOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi).toBeDefined();
      expect(meyumi?.total_grams).toBe(3.5); // default M = 3.5g, qty=1
    });

    it("multiplies gram by quantity", () => {
      const order: RawOrder = {
        total_vnd: 110000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 2,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport([order], powders, milkTypes, noPowderSizes, defaultSizes);
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi?.total_grams).toBe(7); // 3.5g × 2
    });

    it("accumulates gram across multiple orders for same powder", () => {
      const report = buildReport(
        [singleLatteMOrder, singleLatteMOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi?.total_grams).toBe(7); // 3.5g × 2 orders
    });

    it("groups separate powders separately", () => {
      const hanaOrder: RawOrder = {
        total_vnd: 50000,
        items: [
          {
            menu_item_id: "item-latte-2",
            quantity: 1,
            size: "L",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Another Latte",
              category: "latte",
              matcha_powder_id: "powder-hana",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport(
        [singleLatteMOrder, hanaOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      const hana = report.powder_usage.find((p) => p.powder_name === "Hana");
      expect(meyumi?.total_grams).toBe(3.5); // M=3.5
      expect(hana?.total_grams).toBe(4.5); // L=4.5
    });

    it("adds extra matcha addon gram to the same powder", () => {
      const orderWithExtraMatcha: RawOrder = {
        total_vnd: 60000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [
              {
                quantity: 1,
                addonOption: {
                  gram_value: 3, // extra 3g Meyumi
                },
              },
            ],
          },
        ],
      };
      const report = buildReport(
        [orderWithExtraMatcha],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      // base 3.5g + extra 3g = 6.5g
      expect(meyumi?.total_grams).toBe(6.5);
    });

    it("ignores non-matcha addons (gram_value = null)", () => {
      const orderWithOtherAddon: RawOrder = {
        total_vnd: 58000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [
              {
                quantity: 1,
                addonOption: {
                  gram_value: null, // kem addon, no gram
                },
              },
            ],
          },
        ],
      };
      const report = buildReport(
        [orderWithOtherAddon],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi?.total_grams).toBe(3.5); // no change
    });

    it("uses powder_size_config override when available", () => {
      const report = buildReport(
        [singleLatteMOrder], // M size, meyumi
        powders,
        milkTypes,
        meyumiPowderSizes, // meyumi M = 5g
        defaultSizes
      );
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi?.total_grams).toBe(5); // powder_size_config override
    });

    it("excludes powders with 0 total grams from results", () => {
      const report = buildReport(
        [singleLatteMOrder], // only meyumi used
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      // Hana should not appear if not used
      const hana = report.powder_usage.find((p) => p.powder_name === "Hana");
      expect(hana).toBeUndefined();
    });
  });

  describe("milk_usage", () => {
    it("aggregates ml for latte items using default_size_config milk_ml", () => {
      const report = buildReport(
        [singleLatteMOrder], // latte, M, milk-bo, qty=1
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const bo = report.milk_usage.find((m) => m.milk_name === "Sữa bò");
      expect(bo?.total_ml).toBe(130); // default M milk_ml = 130
    });

    it("multiplies milk_ml by quantity", () => {
      const order: RawOrder = {
        total_vnd: 110000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 3,
            size: "L",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport([order], powders, milkTypes, noPowderSizes, defaultSizes);
      const bo = report.milk_usage.find((m) => m.milk_name === "Sữa bò");
      expect(bo?.total_ml).toBe(600); // 200ml × 3
    });

    it("groups different milk types separately", () => {
      const oatOrder: RawOrder = {
        total_vnd: 60000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-oat",
            menuItem: {
              name: "Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport(
        [singleLatteMOrder, oatOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const bo = report.milk_usage.find((m) => m.milk_name === "Sữa bò");
      const oat = report.milk_usage.find((m) => m.milk_name === "Sữa yến mạch");
      expect(bo?.total_ml).toBe(130);
      expect(oat?.total_ml).toBe(130);
    });

    it("ignores fusion items — no milk added", () => {
      const fusionOrder: RawOrder = {
        total_vnd: 55000,
        items: [
          {
            menu_item_id: "item-fusion-1",
            quantity: 2,
            size: "L",
            selected_powder_id: "powder-meyumi",
            selected_milk_type_id: null, // fusion: no milk
            menuItem: {
              name: "Matcha Kem Dừa",
              category: "fusion",
              matcha_powder_id: null,
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport([fusionOrder], powders, milkTypes, noPowderSizes, defaultSizes);
      expect(report.milk_usage).toHaveLength(0);
    });

    it("ignores latte items with null milk type id", () => {
      const order: RawOrder = {
        total_vnd: 55000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: null, // edge case
            menuItem: {
              name: "Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport([order], powders, milkTypes, noPowderSizes, defaultSizes);
      expect(report.milk_usage).toHaveLength(0);
    });
  });

  describe("latte_sales", () => {
    it("includes latte items in latte_sales and not fusion_sales", () => {
      const report = buildReport(
        [singleLatteMOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.latte_sales).toHaveLength(1);
      expect(report.fusion_sales).toHaveLength(0);
    });

    it("tracks quantity per size correctly", () => {
      const report = buildReport(
        [singleLatteMOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const latte = report.latte_sales[0];
      expect(latte.name).toBe("Premium Matcha Latte");
      expect(latte.sizes.M).toBe(1);
      expect(latte.sizes.L).toBe(0);
      expect(latte.sizes.XL).toBe(0);
      expect(latte.total_cups).toBe(1);
    });

    it("accumulates quantities across multiple orders for same item", () => {
      const lOrder: RawOrder = {
        total_vnd: 65000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 2,
            size: "L",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport(
        [singleLatteMOrder, lOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const latte = report.latte_sales[0];
      expect(latte.sizes.M).toBe(1);
      expect(latte.sizes.L).toBe(2);
      expect(latte.total_cups).toBe(3);
    });

    it("separates different latte items", () => {
      const anotherLatte: RawOrder = {
        total_vnd: 50000,
        items: [
          {
            menu_item_id: "item-latte-2",
            quantity: 1,
            size: "XL",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Matcha Sữa Chua",
              category: "latte",
              matcha_powder_id: "powder-hana",
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport(
        [singleLatteMOrder, anotherLatte],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.latte_sales).toHaveLength(2);
      const names = report.latte_sales.map((l) => l.name);
      expect(names).toContain("Premium Matcha Latte");
      expect(names).toContain("Matcha Sữa Chua");
    });
  });

  describe("fusion_sales", () => {
    const fusionOrder: RawOrder = {
      total_vnd: 55000,
      items: [
        {
          menu_item_id: "item-fusion-1",
          quantity: 2,
          size: "M",
          selected_powder_id: "powder-meyumi",
          selected_milk_type_id: null,
          menuItem: {
            name: "Matcha Kem Dừa",
            category: "fusion",
            matcha_powder_id: null,
            custom_powder_grams: null,
          },
          addons: [],
        },
      ],
    };

    it("includes fusion items in fusion_sales and not latte_sales", () => {
      const report = buildReport(
        [fusionOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.fusion_sales).toHaveLength(1);
      expect(report.latte_sales).toHaveLength(0);
    });

    it("tracks fusion quantity per size", () => {
      const report = buildReport(
        [fusionOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      const fusion = report.fusion_sales[0];
      expect(fusion.name).toBe("Matcha Kem Dừa");
      expect(fusion.sizes.M).toBe(2);
      expect(fusion.sizes.L).toBe(0);
      expect(fusion.sizes.XL).toBe(0);
      expect(fusion.total_cups).toBe(2);
    });
  });

  describe("mixed latte + fusion in same report", () => {
    it("correctly segregates latte and fusion sales", () => {
      const mixedOrder: RawOrder = {
        total_vnd: 120000,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Premium Matcha Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [],
          },
          {
            menu_item_id: "item-fusion-1",
            quantity: 1,
            size: "L",
            selected_powder_id: "powder-meyumi",
            selected_milk_type_id: null,
            menuItem: {
              name: "Matcha Kem Dừa",
              category: "fusion",
              matcha_powder_id: null,
              custom_powder_grams: null,
            },
            addons: [],
          },
        ],
      };
      const report = buildReport(
        [mixedOrder],
        powders,
        milkTypes,
        noPowderSizes,
        defaultSizes
      );
      expect(report.latte_sales).toHaveLength(1);
      expect(report.fusion_sales).toHaveLength(1);
      // Total cups = 1 latte M + 1 fusion L
      expect(report.summary.total_cups).toBe(2);
      // Meyumi: 3.5g (latte M default) + 4.5g (fusion L default) = 8g
      const meyumi = report.powder_usage.find((p) => p.powder_name === "Meyumi");
      expect(meyumi?.total_grams).toBe(8);
      // Milk: only latte M = 130ml
      const bo = report.milk_usage.find((m) => m.milk_name === "Sữa bò");
      expect(bo?.total_ml).toBe(130);
    });
  });
});
