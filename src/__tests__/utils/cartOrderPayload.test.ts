import { describe, expect, it } from "vitest";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import { serializeCartOrderItems } from "@/src/lib/utils/cartOrderPayload";

describe("cartOrderPayload", () => {
  it("customer và staff dùng cùng wire item, gồm client line khi có BUNDLE", () => {
    const line: ProjectedCartLine = {
      cartId: "line-1", menuItemId: "drink-1", quantity: 1,
      configuration: { size: "MEDIUM", sweetness: "HALF", iceOption: "LESS_ICE", coldwhisk: true, note: "ít ngọt", powderId: "powder-1", baseLiquidId: "milk-1", addonOptionIds: ["addon-1"] },
      lineVoucher: { token: "product-v", kind: "PRODUCT" }, addonVouchers: [{ token: "addon-v", addonOptionId: "addon-1" }],
      name: "Matcha", imageUrl: null, category: "latte", resolvedAddons: [],
      drinkPriceVnd: 50_000, addonsPriceVnd: 5_000, grossUnitPriceVnd: 55_000,
      personalVoucherDiscountVnd: 50_000, bundleDiscountVnd: 0, payableUnitVnd: 5_000, lineTotalVnd: 5_000,
      errors: [], revalidating: false,
    };
    expect(serializeCartOrderItems([line], { includeClientLineId: true })).toEqual([{
      client_line_id: "line-1", menu_item_id: "drink-1", quantity: 1, size: "MEDIUM",
      sweetness: "HALF", ice_option: "LESS_ICE", coldwhisk: true, note: "ít ngọt",
      addon_option_ids: ["addon-1"], product_voucher_id: "product-v",
      addon_voucher_ids: [{ voucher_id: "addon-v", addon_option_id: "addon-1" }],
      selected_powder_id: "powder-1", selected_base_liquid_id: "milk-1", client_price_vnd: 5_000,
    }]);
  });
});
