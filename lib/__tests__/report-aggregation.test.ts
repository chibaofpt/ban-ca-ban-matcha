/**
 * Tests for buildReport (existing) and buildAdminReport (new) in lib/reportAggregation.ts
 */

import { describe, it, expect } from "vitest";
import { buildReport } from "@/lib/reportAggregation";
// buildAdminReport will be imported once implemented
// import { buildAdminReport } from "@/lib/reportAggregation";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const powders = [
  { id: "powder-meyumi", name: "Meyumi" },
  { id: "powder-hana", name: "Hana" },
];

const milkTypes = [
  { id: "milk-bo", name: "Sữa bò" },
  { id: "milk-oat", name: "Sữa yến mạch" },
];

const defaultSizeEntries = [
  { size: "SMALL" as const, milk_ml: 200, powder_gram: 4 },
  { size: "MEDIUM" as const, milk_ml: 280, powder_gram: 5 },
  { size: "LARGE" as const, milk_ml: 360, powder_gram: 6 },
];

const powderSizeEntries = [
  { powder_id: "powder-meyumi", size: "SMALL" as const, grams: 3.5 },
  { powder_id: "powder-meyumi", size: "MEDIUM" as const, grams: 4.5 },
  { powder_id: "powder-meyumi", size: "LARGE" as const, grams: 5.5 },
];

/** Helper: create a minimal latte RawOrder */
function makeLatteOrder(overrides: {
  total_vnd?: number;
  size?: "SMALL" | "MEDIUM" | "LARGE";
  quantity?: number;
  powderId?: string;
  milkId?: string;
  menuItemId?: string;
  menuItemName?: string;
  baseLiquidMl?: number | null;
}) {
  return {
    total_vnd: overrides.total_vnd ?? 69_000,
    items: [
      {
        menu_item_id: overrides.menuItemId ?? "item-latte-1",
        quantity: overrides.quantity ?? 1,
        size: overrides.size ?? "SMALL",
        selected_powder_id: null,
        selected_milk_type_id: overrides.milkId ?? "milk-bo",
        base_liquid_ml: overrides.baseLiquidMl,
        menuItem: {
          name: overrides.menuItemName ?? "Premium Matcha Latte",
          category: "latte",
          matcha_powder_id: overrides.powderId ?? "powder-meyumi",
          custom_powder_grams: null,
        },
        addons: [],
      },
    ],
  };
}

/** Helper: create a minimal fusion RawOrder */
function makeFusionOrder(overrides: {
  total_vnd?: number;
  size?: "SMALL" | "MEDIUM" | "LARGE";
  quantity?: number;
  powderId?: string;
  menuItemId?: string;
  menuItemName?: string;
}) {
  return {
    total_vnd: overrides.total_vnd ?? 55_000,
    items: [
      {
        menu_item_id: overrides.menuItemId ?? "item-fusion-1",
        quantity: overrides.quantity ?? 1,
        size: overrides.size ?? "SMALL",
        selected_powder_id: overrides.powderId ?? "powder-meyumi",
        selected_milk_type_id: null,
        menuItem: {
          name: overrides.menuItemName ?? "Matcha Kem Dừa",
          category: "fusion",
          matcha_powder_id: null,
          custom_powder_grams: null,
        },
        addons: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// buildReport — Staff
// ---------------------------------------------------------------------------

describe("buildReport — kết quả tổng hợp cơ bản", () => {
  it("trả đúng total_orders, total_cups, total_revenue_vnd", () => {
    const orders = [
      makeLatteOrder({ total_vnd: 69_000, quantity: 2 }),
      makeFusionOrder({ total_vnd: 55_000, quantity: 1 }),
    ];

    const result = buildReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.summary.total_orders).toBe(2);
    expect(result.summary.total_cups).toBe(3); // 2 latte + 1 fusion
    expect(result.summary.total_revenue_vnd).toBe(124_000);
  });

  it("tính powder_usage đúng — dùng powder_size_config khi có", () => {
    const orders = [makeLatteOrder({ size: "SMALL", quantity: 1 })]; // Meyumi SMALL = 3.5g

    const result = buildReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.powder_usage).toHaveLength(1);
    expect(result.powder_usage[0].powder_name).toBe("Meyumi");
    expect(result.powder_usage[0].total_grams).toBe(3.5);
  });

  it("tính milk_usage đúng — dùng default_size_config.milk_ml", () => {
    const orders = [makeLatteOrder({ size: "SMALL", quantity: 2, milkId: "milk-bo" })]; // SMALL = 200ml

    const result = buildReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.milk_usage).toHaveLength(1);
    expect(result.milk_usage[0].milk_name).toBe("Sữa bò");
    expect(result.milk_usage[0].total_ml).toBe(400); // 2 × 200
  });

  it("ưu tiên snapshot ml trên order item để báo cáo lịch sử không đổi theo công thức hiện tại", () => {
    const orders = [makeLatteOrder({
      size: "SMALL",
      quantity: 2,
      milkId: "milk-bo",
      baseLiquidMl: 175,
    })];

    const result = buildReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.milk_usage[0].total_ml).toBe(350);
  });

  it("phân loại latte_sales và fusion_sales đúng", () => {
    const orders = [
      makeLatteOrder({ menuItemId: "item-latte-1", menuItemName: "Premium Matcha Latte", quantity: 3, size: "MEDIUM" }),
      makeFusionOrder({ menuItemId: "item-fusion-1", menuItemName: "Matcha Kem Dừa", quantity: 2, size: "LARGE" }),
    ];

    const result = buildReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.latte_sales).toHaveLength(1);
    expect(result.latte_sales[0].name).toBe("Premium Matcha Latte");
    expect(result.latte_sales[0].sizes.MEDIUM).toBe(3);
    expect(result.latte_sales[0].total_cups).toBe(3);

    expect(result.fusion_sales).toHaveLength(1);
    expect(result.fusion_sales[0].name).toBe("Matcha Kem Dừa");
    expect(result.fusion_sales[0].sizes.LARGE).toBe(2);
  });

  it("trả về mảng rỗng khi không có đơn", () => {
    const result = buildReport([], powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.summary.total_orders).toBe(0);
    expect(result.summary.total_cups).toBe(0);
    expect(result.summary.total_revenue_vnd).toBe(0);
    expect(result.powder_usage).toHaveLength(0);
    expect(result.milk_usage).toHaveLength(0);
    expect(result.latte_sales).toHaveLength(0);
    expect(result.fusion_sales).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildAdminReport — Admin extras
// ---------------------------------------------------------------------------

describe("buildAdminReport — Admin extras (addon_usage, revenue_by_type, top_products)", () => {
  it("tính addon_usage theo addon option và trả breakdown bột ổn định", async () => {
    const { buildAdminReport } = await import("@/lib/reportAggregation");

    const orders = [
      {
        total_vnd: 69_000,
        order_type: "COUNTER" as const,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "SMALL" as const,
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: {
              name: "Latte",
              category: "latte",
              matcha_powder_id: "powder-meyumi",
              custom_powder_grams: null,
            },
            addons: [
              {
                addon_option_id: "addon-kem",
                quantity: 1,
                unit_price_vnd: 0,
                addonOption: { label: "Nửa viên kem", group: { name: "Kem" }, gram_value: null },
              },
              {
                addon_option_id: "addon-matcha",
                quantity: 1,
                unit_price_vnd: 5000,
                addonOption: { label: "Thêm matcha", group: { name: "Matcha" }, gram_value: 2 },
              },
            ],
          },
        ],
      },
      {
        total_vnd: 55_000,
        order_type: "PICKUP" as const,
        items: [
          {
            menu_item_id: "item-fusion-1",
            quantity: 1,
            size: "SMALL" as const,
            selected_powder_id: "powder-meyumi",
            selected_milk_type_id: null,
            menuItem: {
              name: "Fusion",
              category: "fusion",
              matcha_powder_id: null,
              custom_powder_grams: null,
            },
            addons: [
              {
                addon_option_id: "addon-kem",
                quantity: 1,
                unit_price_vnd: 0,
                addonOption: { label: "Nửa viên kem", group: { name: "Kem" }, gram_value: null },
              },
            ],
          },
        ],
      },
    ];

    const result = buildAdminReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    // "Nửa viên kem" xuất hiện 2 lần (từ 2 đơn)
    const kemAddon = result.addon_usage.find((a) => a.addon_label === "Nửa viên kem");
    expect(kemAddon).toBeDefined();
    expect(kemAddon?.addon_option_id).toBe("addon-kem");
    expect(kemAddon?.total_count).toBe(2);
    expect(kemAddon?.powder_breakdown).toEqual([]);

    // "Thêm matcha" xuất hiện 1 lần
    const matchaAddon = result.addon_usage.find((a) => a.addon_label === "Thêm matcha");
    expect(matchaAddon).toBeDefined();
    expect(matchaAddon?.addon_option_id).toBe("addon-matcha");
    expect(matchaAddon?.total_count).toBe(1);
    expect(matchaAddon?.group_name).toBe("Matcha");
    expect(matchaAddon?.powder_breakdown).toEqual([
      { powder_name: "Meyumi", total_grams: 2 },
    ]);
  });

  it("không gộp nhầm addon trùng nhãn và nhân gram theo số ly", async () => {
    const { buildAdminReport } = await import("@/lib/reportAggregation");

    const orders = [{
      total_vnd: 150_000,
      order_type: "COUNTER" as const,
      items: [
        {
          menu_item_id: "item-latte-1",
          quantity: 3,
          size: "SMALL" as const,
          selected_powder_id: null,
          selected_milk_type_id: "milk-bo",
          menuItem: { name: "Latte", category: "latte", matcha_powder_id: "powder-meyumi", custom_powder_grams: null },
          addons: [{
            addon_option_id: "addon-matcha-regular",
            quantity: 2,
            unit_price_vnd: 10_000,
            addonOption: { label: "Thêm matcha", group: { name: "Matcha" }, gram_value: 2 },
          }],
        },
        {
          menu_item_id: "item-fusion-1",
          quantity: 1,
          size: "SMALL" as const,
          selected_powder_id: "powder-hana",
          selected_milk_type_id: null,
          menuItem: { name: "Fusion", category: "fusion", matcha_powder_id: null, custom_powder_grams: null },
          addons: [{
            addon_option_id: "addon-matcha-premium",
            quantity: 1,
            unit_price_vnd: 7_000,
            addonOption: { label: "Thêm matcha", group: { name: "Matcha premium" }, gram_value: 1 },
          }],
        },
      ],
    }];

    const result = buildAdminReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.addon_usage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        addon_option_id: "addon-matcha-regular",
        total_count: 6,
        powder_breakdown: [{ powder_name: "Meyumi", total_grams: 12 }],
      }),
      expect.objectContaining({
        addon_option_id: "addon-matcha-premium",
        total_count: 1,
        powder_breakdown: [{ powder_name: "Hana", total_grams: 1 }],
      }),
    ]));
  });

  it("tính revenue_by_type đúng — COUNTER vs PICKUP vs DELIVERY", async () => {
    const { buildAdminReport } = await import("@/lib/reportAggregation");

    const orders = [
      { total_vnd: 69_000, order_type: "COUNTER" as const, items: [] },
      { total_vnd: 55_000, order_type: "COUNTER" as const, items: [] },
      { total_vnd: 80_000, order_type: "PICKUP" as const, items: [] },
      { total_vnd: 90_000, order_type: "DELIVERY" as const, items: [] },
    ];

    const result = buildAdminReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    const counter = result.revenue_by_type.find((r) => r.order_type === "COUNTER");
    expect(counter?.total_revenue_vnd).toBe(124_000);
    expect(counter?.order_count).toBe(2);

    const pickup = result.revenue_by_type.find((r) => r.order_type === "PICKUP");
    expect(pickup?.total_revenue_vnd).toBe(80_000);
    expect(pickup?.order_count).toBe(1);

    const delivery = result.revenue_by_type.find((r) => r.order_type === "DELIVERY");
    expect(delivery?.total_revenue_vnd).toBe(90_000);
    expect(delivery?.order_count).toBe(1);
  });

  it("top_products liệt kê tất cả sản phẩm, sorted descending theo số ly", async () => {
    const { buildAdminReport } = await import("@/lib/reportAggregation");

    const orders = [
      {
        total_vnd: 69_000,
        order_type: "COUNTER" as const,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 5,
            size: "SMALL" as const,
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: { name: "Latte A", category: "latte", matcha_powder_id: "powder-meyumi", custom_powder_grams: null },
            addons: [],
          },
          {
            menu_item_id: "item-fusion-1",
            quantity: 2,
            size: "MEDIUM" as const,
            selected_powder_id: "powder-meyumi",
            selected_milk_type_id: null,
            menuItem: { name: "Fusion B", category: "fusion", matcha_powder_id: null, custom_powder_grams: null },
            addons: [],
          },
          {
            menu_item_id: "item-latte-2",
            quantity: 8,
            size: "LARGE" as const,
            selected_powder_id: null,
            selected_milk_type_id: "milk-oat",
            menuItem: { name: "Latte C", category: "latte", matcha_powder_id: "powder-hana", custom_powder_grams: null },
            addons: [],
          },
        ],
      },
    ];

    const result = buildAdminReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    expect(result.top_products).toHaveLength(3);
    // Sorted descending: Latte C (8) > Latte A (5) > Fusion B (2)
    expect(result.top_products[0].name).toBe("Latte C");
    expect(result.top_products[0].total_cups).toBe(8);
    expect(result.top_products[1].name).toBe("Latte A");
    expect(result.top_products[1].total_cups).toBe(5);
    expect(result.top_products[2].name).toBe("Fusion B");
    expect(result.top_products[2].total_cups).toBe(2);
  });

  it("addon_usage không đếm addon khi quantity = 0", async () => {
    const { buildAdminReport } = await import("@/lib/reportAggregation");

    const orders = [
      {
        total_vnd: 69_000,
        order_type: "COUNTER" as const,
        items: [
          {
            menu_item_id: "item-latte-1",
            quantity: 1,
            size: "SMALL" as const,
            selected_powder_id: null,
            selected_milk_type_id: "milk-bo",
            menuItem: { name: "Latte", category: "latte", matcha_powder_id: "powder-meyumi", custom_powder_grams: null },
            addons: [
              // quantity = 0 nên không được đếm
              {
                addon_option_id: "addon-no-cream",
                quantity: 0,
                unit_price_vnd: 0,
                addonOption: { label: "Không kem", group: { name: "Kem" }, gram_value: null },
              },
            ],
          },
        ],
      },
    ];

    const result = buildAdminReport(orders, powders, milkTypes, powderSizeEntries, defaultSizeEntries);

    const addon = result.addon_usage.find((a) => a.addon_label === "Không kem");
    expect(addon).toBeUndefined();
  });
});
