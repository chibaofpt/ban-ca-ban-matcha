import { describe, expect, it } from "vitest";
import {
  evaluateBundlePromotion,
  type BundleCartItem,
  type BundleEvaluationResult,
  type BundlePromotionRule,
} from "@/lib/promotionBundle";
import { makeRule, expectReason } from "./promotion-bundle.fixtures";

const DRINK_ID = "11111111-1111-4111-8111-111111111111";
const EXTRA_ID = "66666666-6666-4666-8666-666666666666";
const DRINK_LINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXTRA_LINE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type ExtrasBundleCartItem = Omit<BundleCartItem, "size"> & {
  category: "latte" | "extras";
  size: null;
};

type ExtrasBundleInput = {
  rule: BundlePromotionRule;
  items: ExtrasBundleCartItem[];
  reward_allocations: Array<{
    client_line_id: string;
    quantity: number;
    addon_option_id?: string;
  }>;
};

const evaluateExtrasBundle: (input: ExtrasBundleInput) => BundleEvaluationResult =
  evaluateBundlePromotion;

function makeExtra(overrides: Partial<ExtrasBundleCartItem> = {}): ExtrasBundleCartItem {
  return {
    client_line_id: EXTRA_LINE_ID,
    menu_item_id: EXTRA_ID,
    category: "extras",
    size: null,
    selected_powder_id: null,
    selected_milk_type_id: null,
    unit_price_vnd: 20_000,
    quantity: 1,
    product_voucher_quantity: 0,
    addons: [],
    ...overrides,
  };
}

describe("BUNDLE với extras", () => {
  it("cho phép qualifier là đồ uống nhưng reward là extras theo allowed scope", () => {
    const rule = makeRule({
      buy_quantity: 1,
      reward_quantity: 1,
      reward_mode: "ALLOWED_SCOPE",
      qualifier_scopes: [
        { menu_item_id: DRINK_ID, size: null, powder_id: null, milk_type_id: null },
        { menu_item_id: EXTRA_ID, size: null, powder_id: null, milk_type_id: null },
      ],
      reward_product_scopes: [
        {
          menu_item_id: EXTRA_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 20_000,
        },
      ],
    });
    const drink: ExtrasBundleCartItem = {
      ...makeExtra({
        client_line_id: DRINK_LINE_ID,
        menu_item_id: DRINK_ID,
        category: "latte",
        unit_price_vnd: 45_000,
      }),
    };

    const result = evaluateExtrasBundle({
      rule,
      items: [drink, makeExtra()],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    });

    expect(result.total_discount_vnd).toBe(20_000);
    expect(result.rewards).toMatchObject([
      { client_line_id: EXTRA_LINE_ID, quantity: 1, discount_vnd: 20_000 },
    ]);
  });

  it("không tính unit được reward vào min_order_vnd", () => {
    const rule = makeRule({
      min_order_vnd: 40_000,
      qualifier_scopes: [
        { menu_item_id: EXTRA_ID, size: null, powder_id: null, milk_type_id: null },
      ],
      reward_product_scopes: [
        {
          menu_item_id: EXTRA_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 20_000,
        },
      ],
    });

    expectReason(
      () =>
        evaluateExtrasBundle({
          rule,
          items: [makeExtra({ quantity: 2 })],
          reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
        }),
      "BUNDLE_MIN_ORDER_NOT_MET",
    );
  });

  it("chỉ cấp reward cho unit extras chưa được ITEM voucher che phủ", () => {
    const rule = makeRule({
      max_applications_per_order: 2,
      max_reward_units_per_order: 2,
      qualifier_scopes: [
        { menu_item_id: EXTRA_ID, size: null, powder_id: null, milk_type_id: null },
      ],
      reward_product_scopes: [
        {
          menu_item_id: EXTRA_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 20_000,
        },
      ],
    });

    const result = evaluateExtrasBundle({
      rule,
      items: [makeExtra({ quantity: 3, product_voucher_quantity: 1 })],
      reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 1 }],
    });
    expect(result.total_discount_vnd).toBe(20_000);

    expectReason(
      () =>
        evaluateExtrasBundle({
          rule,
          items: [makeExtra({ quantity: 2, product_voucher_quantity: 1 })],
          reward_allocations: [{ client_line_id: EXTRA_LINE_ID, quantity: 2 }],
        }),
      "BUNDLE_CONFLICT",
    );
  });
});
