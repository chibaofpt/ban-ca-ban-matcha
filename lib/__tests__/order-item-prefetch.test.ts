import { beforeEach, describe, expect, it, vi } from "vitest";

const buildPricingContext = vi.fn();

vi.mock("@/lib/pricing", () => ({
  buildPricingContext: (...args: unknown[]) => buildPricingContext(...args),
  resolveOrderItemPrice: () => 40_000,
  resolveOrderItemPremiumLatte: () => Promise.resolve(0),
  resolveOrderItemBaseLiquidMl: () => 200,
}));

import { processOrderItems } from "@/lib/orders";

function menu(id: string) {
  return {
    id,
    name: id,
    category: "latte",
    is_available: true,
    matcha_powder_id: "powder-1",
    default_powder_id: null,
    custom_powder_grams: null,
    default_base_liquid_id: null,
    fusionAllowedPowders: [],
    allowedBaseLiquids: [],
    sizes: [{ size: "MEDIUM", base_price_vnd: 40_000, base_liquid_ml: null }],
  };
}

function addon(id: string, price: number) {
  return {
    id,
    price_vnd: price,
    gram_value: null,
    is_active: true,
    group: { id: `group-${id}`, is_active: true, max_select: 1, is_dynamic_gram: false },
  };
}

describe("tải catalog cho order có nhiều addon", () => {
  beforeEach(() => {
    buildPricingContext.mockResolvedValue({
      defaultSizeConfigs: [],
      powderPriceMap: { "powder-1": 5_000 },
      powderSizeConfigMap: {},
      defaultMilkPricePerMl: 40,
      defaultBaseLiquidId: "milk-1",
      milkPriceMap: { "milk-1": 40 },
      availablePowders: [{ id: "powder-1", name: "Powder" }],
      availableBaseLiquids: [{ id: "milk-1", is_active: true, display_order: 0 }],
    });
  });

  it("batch menu và addon một lần thay vì query tuần tự từng món", async () => {
    const menuFindMany = vi.fn().mockResolvedValue([menu("menu-1"), menu("menu-2")]);
    const addonFindMany = vi.fn().mockResolvedValue([addon("gift-addon", 5_000), addon("paid-addon", 7_000)]);
    const menuFindUnique = vi.fn(() => { throw new Error("không được query từng menu"); });
    const addonFindUnique = vi.fn(() => { throw new Error("không được query từng addon"); });
    const db = {
      menuItem: { findMany: menuFindMany, findUnique: menuFindUnique },
      addonOption: { findMany: addonFindMany, findUnique: addonFindUnique },
    };

    const result = await processOrderItems([
      {
        menu_item_id: "menu-1", quantity: 1, size: "MEDIUM", sweetness: "FULL",
        addon_option_ids: ["gift-addon", "paid-addon"], client_price_vnd: 52_000,
      },
      {
        menu_item_id: "menu-2", quantity: 1, size: "MEDIUM", sweetness: "FULL",
        addon_option_ids: [], client_price_vnd: 40_000,
      },
    ], db as never);

    expect(result[0]?.addons_price_vnd).toBe(12_000);
    expect(menuFindMany).toHaveBeenCalledTimes(1);
    expect(addonFindMany).toHaveBeenCalledTimes(1);
    expect(menuFindUnique).not.toHaveBeenCalled();
    expect(addonFindUnique).not.toHaveBeenCalled();
  });
});
