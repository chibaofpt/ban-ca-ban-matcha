import { describe, it, expect } from "vitest";
import {
  buildReorderItem,
  getReorderVoucherEligibleAddonIds,
} from "@/src/utils/reorderHelper";
import type { HistoryOrderItem } from "@/src/lib/types/reorder";
import type { MenuData } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";

const mockMenuData: MenuData = {
  updated_at: new Date().toISOString(),
  milk_types: [
    { id: "milk1", name: "Sữa bò", price_per_ml: 40, is_default: true, display_order: 1 },
    { id: "milk2", name: "Sữa hạt", price_per_ml: 50, is_default: false, display_order: 2 }
  ],
  addon_groups: [
    {
      id: "ag1", name: "Kem", type: "SELECTOR", is_required: false, min_quantity: null, max_quantity: null,
      options: [
        { id: "opt1", label: "Kem cheese", price_vnd: 15000, gram_value: null, is_default: false, sort_order: 1 },
        { id: "opt2", label: "Trân châu", price_vnd: 10000, gram_value: null, is_default: false, sort_order: 2 }
      ]
    },
    {
      id: "ag2", name: "Extra Matcha", type: "SELECTOR", is_required: false, min_quantity: null, max_quantity: null,
      options: [
        { id: "opt_extra1", label: "Extra 2g", price_vnd: 0, gram_value: 2, is_default: false, sort_order: 1 }
      ]
    }
  ],
  latte: [
    {
      id: "latte1", name: "Latte Matcha", category: "latte", is_seasonal: false, image_url: null, sort_order: 1, base_liquid_note: null,
      custom_powder_grams: null, powder: { id: "p1", name: "Yuri", type: "RECOMMEND" }, resolved_default_powder_id: null, allowed_powder_ids: [],
      sizes: [
        { size: "SMALL", base_price_vnd: 10000, milk_ml: 200 },
        { size: "MEDIUM", base_price_vnd: 15000, milk_ml: 300 } // with Yuri(2000/g)*5g = 10000. Milk 300*40 = 12000. Base 15000 + 10000 + 12000 = 37000
      ]
    }
  ],
  fusion: [
    {
      id: "fusion1", name: "Trà Đào Matcha", category: "fusion", is_seasonal: false, image_url: null, sort_order: 1, base_liquid_note: "Trà đào",
      custom_powder_grams: null, powder: null, resolved_default_powder_id: "p1", allowed_powder_ids: ["p1", "p2"],
      sizes: [
        { size: "MEDIUM", base_price_vnd: 20000, milk_ml: 0 } // with Yuri(2000/g)*5g = 10000. Premium = 0. Base 20000 + 10000 = 30000
      ]
    }
  ]
} as unknown as MenuData;

const mockPowderData: PowderApiResponse = {
  data: [
    {
      id: "p1", name: "Yuri", manufacturer: null, description: null, price_per_gram: 2000, type: "RECOMMEND",
      fragrance: null, body: null, bitterness: null, umami: null, color: null, is_available: true, reference_latte_item_id: "latte1",
      size_config: []
    },
    {
      id: "p2", name: "Kaze", manufacturer: null, description: null, price_per_gram: 3000, type: "RECOMMEND",
      fragrance: null, body: null, bitterness: null, umami: null, color: null, is_available: true, reference_latte_item_id: "latte1",
      size_config: []
    }
  ],
  default_powder_gram: [
    { size: "SMALL", grams: 3 },
    { size: "MEDIUM", grams: 5 },
    { size: "LARGE", grams: 7 }
  ]
} as PowderApiResponse;

describe("buildReorderItem", () => {
  it("trả về cartItem hợp lệ cho Latte item có đủ dữ liệu", () => {
    const item: HistoryOrderItem = {
      menu_item_id: "latte1",
      quantity: 2,
      size: "MEDIUM",
      unit_price_vnd: 37000,
      addons_price_vnd: 15000,
      sweetness: "HALF",
      ice_option: "LESS_ICE",
      coldwhisk: true,
      note: "Ít ngọt",
      selected_powder_id: null,
      selected_milk_type_id: "milk1",
      menuItem: { name: "Latte Matcha", category: "latte" },
      addons: [
        { addon_option_id: "opt1", unit_price_vnd: 15000, quantity: 1, addonOption: { label: "Kem cheese", price_vnd: 15000, gram_value: null, group: { name: "Kem" } } }
      ]
    };

    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.warnings).toHaveLength(0);
    expect(res.cartItem).not.toBeNull();
    expect(res.cartItem?.menuItemId).toBe("latte1");
    expect(res.cartItem?.unitPrice).toBe(52000); // 37k + 15k
    expect(res.cartItem?.clientPriceVnd).toBe(52000);
    expect(res.configSummary).toContain("Latte Matcha — Cá vừa (500ml)");
    expect(res.configSummary).toContain("Ngọt 50% · Ít đá · Coldwhisk · Sữa bò");
    expect(res.configSummary).toContain("Kem cheese");
  });

  it("trả về cartItem hợp lệ cho Fusion item có đủ dữ liệu (kèm warning giá đổi)", () => {
    const item: HistoryOrderItem = {
      menu_item_id: "fusion1",
      quantity: 1,
      size: "MEDIUM",
      unit_price_vnd: 30000,
      addons_price_vnd: 0,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: null,
      selected_powder_id: "p2",
      selected_milk_type_id: null,
      menuItem: { name: "Trà Đào Matcha", category: "fusion" },
      addons: []
    };

    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0].type).toBe("PRICE_CHANGED");
    expect(res.cartItem).not.toBeNull();
    expect(res.cartItem?.selectedPowderId).toBe("p2");
    // Fusion p2(Kaze 3000/g)*5g = 15000. Base = 20000. Total = 35000. Premium = 0 (since both use latte1 reference which has same price)
    expect(res.cartItem?.unitPrice).toBe(35000);
    expect(res.configSummary).toContain("Ngọt 100% · Kaze");
  });

  it("trả cartItem null + warning ITEM_UNAVAILABLE khi món không còn", () => {
    const item = { menu_item_id: "missing", size: "MEDIUM", menuItem: { name: "Cũ", category: "latte" } } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.cartItem).toBeNull();
    expect(res.warnings[0].type).toBe("ITEM_UNAVAILABLE");
  });

  it("trả cartItem null + warning SIZE_UNAVAILABLE khi size đã ngừng bán", () => {
    const item = { menu_item_id: "latte1", size: "LARGE", menuItem: { name: "Latte Matcha", category: "latte" } } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.cartItem).toBeNull();
    expect(res.warnings[0].type).toBe("SIZE_UNAVAILABLE");
  });

  it("warning MILK_UNAVAILABLE + fallback sữa bò khi sữa cũ không active", () => {
    const item = {
      menu_item_id: "latte1", size: "MEDIUM", selected_milk_type_id: "milk_missing", sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false,
      addons: [], menuItem: { name: "Latte Matcha", category: "latte" }
    } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.cartItem?.selectedMilkTypeId).toBe("milk1");
    expect(res.warnings[0].type).toBe("MILK_UNAVAILABLE");
  });

  it("warning POWDER_UNAVAILABLE + fallback default powder cho Fusion", () => {
    const item = {
      menu_item_id: "fusion1", size: "MEDIUM", selected_powder_id: "p_missing", sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false,
      addons: [], menuItem: { name: "Trà Đào Matcha", category: "fusion" }
    } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.cartItem?.selectedPowderId).toBe("p1");
    expect(res.warnings[0].type).toBe("POWDER_UNAVAILABLE");
  });

  it("warning ADDON_UNAVAILABLE, vẫn trả cartItem, bỏ addon thiếu", () => {
    const item = {
      menu_item_id: "latte1", size: "MEDIUM", selected_milk_type_id: "milk1", sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false,
      addons: [{ addon_option_id: "opt_missing", addonOption: { label: "Kem chuối" } }],
      unit_price_vnd: 37000, addons_price_vnd: 5000, menuItem: { name: "Latte Matcha", category: "latte" }
    } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.cartItem).not.toBeNull();
    expect(res.cartItem?.selectedOptionIds).toHaveLength(0);
    expect(res.warnings.some(w => w.type === "ADDON_UNAVAILABLE")).toBe(true);
  });

  it("warning PRICE_CHANGED khi giá mới khác giá cũ", () => {
    const item = {
      menu_item_id: "latte1", size: "MEDIUM", selected_milk_type_id: "milk1", sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false,
      addons: [], unit_price_vnd: 30000, addons_price_vnd: 0, // Old price was 30000, new is 37000
      menuItem: { name: "Latte Matcha", category: "latte" }
    } as unknown as HistoryOrderItem;
    const res = buildReorderItem(item, mockMenuData, mockPowderData);
    expect(res.warnings.some(w => w.type === "PRICE_CHANGED")).toBe(true);
    expect(res.cartItem?.unitPrice).toBe(37000);
  });

  it("lưu giá một đơn vị addon QUANTITY để voucher chỉ giảm một phần", () => {
    const quantityMenuData: MenuData = {
      ...mockMenuData,
      addon_groups: mockMenuData.addon_groups.map((group) =>
        group.id === "ag1" ? { ...group, type: "QUANTITY" } : group,
      ),
    };
    const item: HistoryOrderItem = {
      menu_item_id: "latte1",
      quantity: 1,
      size: "MEDIUM",
      unit_price_vnd: 37000,
      addons_price_vnd: 30000,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: null,
      selected_powder_id: null,
      selected_milk_type_id: "milk1",
      menuItem: { name: "Latte Matcha", category: "latte" },
      addons: [
        {
          addon_option_id: "opt1",
          unit_price_vnd: 15000,
          quantity: 2,
          addonOption: {
            label: "Kem cheese",
            price_vnd: 15000,
            gram_value: null,
            group: { name: "Kem" },
          },
        },
      ],
    };

    const res = buildReorderItem(item, quantityMenuData, mockPowderData);

    expect(res.cartItem?.addonsPrice).toBe(30000);
    expect(res.cartItem?.addonPrices.opt1).toBe(15000);
  });

  it("dùng sữa mặc định khi đơn cũ không lưu lựa chọn sữa", () => {
    const item: HistoryOrderItem = {
      menu_item_id: "latte1",
      quantity: 1,
      size: "MEDIUM",
      unit_price_vnd: 37000,
      addons_price_vnd: 0,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: null,
      selected_powder_id: null,
      selected_milk_type_id: null,
      menuItem: { name: "Latte Matcha", category: "latte" },
      addons: [],
    };

    const res = buildReorderItem(item, mockMenuData, mockPowderData);

    expect(res.cartItem?.selectedMilkTypeId).toBe("milk1");
    expect(res.cartItem?.unitPrice).toBe(37000);
  });

  it("fallback về bột mặc định khi bột cũ không còn được phép cho Fusion", () => {
    const restrictedMenuData: MenuData = {
      ...mockMenuData,
      fusion: mockMenuData.fusion.map((item) => ({
        ...item,
        allowed_powder_ids: ["p1"],
      })),
    };
    const item: HistoryOrderItem = {
      menu_item_id: "fusion1",
      quantity: 1,
      size: "MEDIUM",
      unit_price_vnd: 35000,
      addons_price_vnd: 0,
      sweetness: "FULL",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: null,
      selected_powder_id: "p2",
      selected_milk_type_id: null,
      menuItem: { name: "Trà Đào Matcha", category: "fusion" },
      addons: [],
    };

    const res = buildReorderItem(item, restrictedMenuData, mockPowderData);

    expect(res.cartItem?.selectedPowderId).toBe("p1");
    expect(res.warnings.some((warning) => warning.type === "POWDER_UNAVAILABLE")).toBe(true);
  });

  it("không cho tự áp voucher ADDON vào Extra Matcha", () => {
    const ids = getReorderVoucherEligibleAddonIds(mockMenuData, {
      selectedOptionIds: ["opt1", "opt_extra1"],
      quantityAddonOptions: [],
    });

    expect(ids).toEqual(["opt1"]);
  });
});
