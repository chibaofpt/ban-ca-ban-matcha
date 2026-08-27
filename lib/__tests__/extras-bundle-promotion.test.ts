import { describe, expect, it } from "vitest";
import { evaluateBundlePromotion, type BundleCartItem } from "@/lib/promotionBundle";
import { expectReason, makeItem, makeRule } from "./promotion-bundle.fixtures";

const DRINK_ID = "11111111-1111-4111-8111-111111111111";
const EXTRA_ID = "66666666-6666-4666-8666-666666666666";
const DRINK_LINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXTRA_LINE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeExtra(overrides: Partial<BundleCartItem> = {}): BundleCartItem {
  return { client_line_id: EXTRA_LINE_ID, menu_item_id: EXTRA_ID, size: null,
    selected_powder_id: null, selected_milk_type_id: null, unit_price_vnd: 20_000,
    quantity: 1, product_voucher_quantity: 0, addons: [], ...overrides };
}

const extraProduct = {
  menu_item_id: EXTRA_ID, allowed_sizes: [], default_powder_id: null,
  default_base_liquid_id: null, baseline_prices_vnd: {}, baseline_price_vnd: 20_000,
};

describe("BUNDLE với extras", () => {
  it("cho phép qualifier đồ uống và reward extras theo allowed scope", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ reward_mode: "ALLOWED_SCOPE", reward_products: [extraProduct] }),
      items: [makeItem({ client_line_id: DRINK_LINE_ID, menu_item_id: DRINK_ID, quantity: 1 }), makeExtra()],
      qualifier_allocations: [{ client_line_id: DRINK_LINE_ID, quantity: 1 }],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    });
    expect(result.total_discount_vnd).toBe(20_000);
  });

  it("không tính unit reward vào min_order_vnd", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule({ min_order_vnd: 40_000, qualifier_products: [extraProduct] }),
      items: [makeExtra({ quantity: 2 })],
      qualifier_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    }), "BUNDLE_MIN_ORDER_NOT_MET");
  });

  it("chỉ cấp reward extras cho unit chưa có ITEM voucher", () => {
    const rule = makeRule({ qualifier_products: [extraProduct] });
    const result = evaluateBundlePromotion({
      rule, items: [makeExtra({ quantity: 3, product_voucher_quantity: 1 })],
      qualifier_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    });
    expect(result.total_discount_vnd).toBe(20_000);

    expectReason(() => evaluateBundlePromotion({
      rule, items: [makeExtra({ quantity: 2, product_voucher_quantity: 1 })],
      qualifier_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    }), "BUNDLE_CONFLICT");
  });
});
