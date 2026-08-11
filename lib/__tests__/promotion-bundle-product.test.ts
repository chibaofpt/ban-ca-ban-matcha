import { describe, expect, it } from "vitest";
import { evaluateBundlePromotion } from "@/lib/promotionBundle";
import {
  ADDON_ID,
  LATTE_ID,
  OTHER_ID,
  POWDER_ID,
  expectReason,
  makeItem,
  makeRule,
} from "@/lib/__tests__/promotion-bundle.fixtures";

describe("BUNDLE sản phẩm — mua X tặng Y", () => {
  it("mua 1 tặng 1 cùng cấu hình → miễn đúng một ly theo giá hiện tại", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule(),
      items: [makeItem()],
      reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
    });

    expect(result.application_count).toBe(1);
    expect(result.total_discount_vnd).toBe(45_000);
    expect(result.rewards).toEqual([
      {
        client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        addon_option_id: null,
        quantity: 1,
        discount_vnd: 45_000,
      },
    ]);
  });

  it("không tính cùng một unit vừa là món mua vừa là phần quà", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule(),
          items: [makeItem({ quantity: 1 })],
          reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
        }),
      "BUNDLE_NOT_ELIGIBLE",
    );
  });

  it("SAME_CONFIG từ chối quà khác size với món trả tiền", () => {
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      size: "MEDIUM",
      quantity: 1,
      unit_price_vnd: 55_000,
    });
    const paid = makeItem({ quantity: 1 });

    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule(),
          items: [paid, gift],
          reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
        }),
      "BUNDLE_SCOPE_MISMATCH",
    );
  });

  it("SAME_CONFIG từ chối quà khác bột hoặc sữa", () => {
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      selected_powder_id: OTHER_ID,
      quantity: 1,
    });

    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule(),
          items: [makeItem({ quantity: 1 }), gift],
          reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
        }),
      "BUNDLE_SCOPE_MISMATCH",
    );
  });

  it("không đưa addon trả phí vào mức miễn của quà sản phẩm", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({
          addons: [{ addon_option_id: ADDON_ID, quantity: 2, unit_price_vnd: 15_000, gram_value: null }],
        }),
      ],
      reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
    });

    expect(result.total_discount_vnd).toBe(45_000);
  });

  it("FIXED_CONFIG miễn toàn bộ giá hiện tại khi quà khớp cấu hình admin", () => {
    const rule = makeRule({
      reward_mode: "FIXED_CONFIG",
      reward_product_scopes: [
        {
          menu_item_id: OTHER_ID,
          size: "MEDIUM",
          powder_id: POWDER_ID,
          milk_type_id: null,
          reference_price_vnd: 0,
        },
      ],
    });
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      menu_item_id: OTHER_ID,
      size: "MEDIUM",
      selected_milk_type_id: null,
      quantity: 1,
      unit_price_vnd: 60_000,
    });

    const result = evaluateBundlePromotion({
      rule,
      items: [makeItem({ quantity: 1 }), gift],
      reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
    });

    expect(result.total_discount_vnd).toBe(60_000);
  });

  it("FIXED_CONFIG từ chối quà khác powder dù đúng product và size", () => {
    const rule = makeRule({
      reward_mode: "FIXED_CONFIG",
      reward_product_scopes: [
        {
          menu_item_id: OTHER_ID,
          size: "MEDIUM",
          powder_id: POWDER_ID,
          milk_type_id: null,
        },
      ],
    });
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      menu_item_id: OTHER_ID,
      size: "MEDIUM",
      selected_powder_id: "99999999-9999-4999-8999-999999999999",
      selected_milk_type_id: null,
      quantity: 1,
    });

    expect(() =>
      evaluateBundlePromotion({
        rule,
        items: [makeItem(), gift],
        reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
      }),
    ).toThrowError(expect.objectContaining({ reason: "BUNDLE_SCOPE_MISMATCH" }));
  });

  it("ALLOWED_SCOPE chỉ miễn đến giá cấu hình tham chiếu và khách trả nâng cấp", () => {
    const rule = makeRule({
      reward_mode: "ALLOWED_SCOPE",
      reward_product_scopes: [
        {
          menu_item_id: OTHER_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 45_000,
        },
      ],
    });
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      menu_item_id: OTHER_ID,
      quantity: 1,
      unit_price_vnd: 60_000,
    });

    const result = evaluateBundlePromotion({
      rule,
      items: [makeItem({ quantity: 1 }), gift],
      reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
    });

    expect(result.total_discount_vnd).toBe(45_000);
  });

  it("ALLOWED_SCOPE không tạo surplus khi quà rẻ hơn cấu hình tham chiếu", () => {
    const rule = makeRule({
      reward_mode: "ALLOWED_SCOPE",
      reward_product_scopes: [
        {
          menu_item_id: OTHER_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 55_000,
        },
      ],
    });
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      menu_item_id: OTHER_ID,
      quantity: 1,
      unit_price_vnd: 40_000,
    });

    const result = evaluateBundlePromotion({
      rule,
      items: [makeItem({ quantity: 1 }), gift],
      reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
    });

    expect(result.total_discount_vnd).toBe(40_000);
  });

  it("từ chối món quà nằm ngoài danh sách sản phẩm được phép", () => {
    const rule = makeRule({
      reward_mode: "ALLOWED_SCOPE",
      reward_product_scopes: [
        {
          menu_item_id: LATTE_ID,
          size: null,
          powder_id: null,
          milk_type_id: null,
          reference_price_vnd: 45_000,
        },
      ],
    });
    const gift = makeItem({
      client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      menu_item_id: OTHER_ID,
      quantity: 1,
    });

    expectReason(
      () =>
        evaluateBundlePromotion({
          rule,
          items: [makeItem({ quantity: 1 }), gift],
          reward_allocations: [{ client_line_id: gift.client_line_id, quantity: 1 }],
        }),
      "BUNDLE_SCOPE_MISMATCH",
    );
  });

  it("không dùng unit có PRODUCT voucher làm món mua hoặc món quà", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule(),
          items: [makeItem({ quantity: 2, product_voucher_quantity: 1 })],
          reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1 }],
        }),
      "BUNDLE_CONFLICT",
    );
  });

  it("áp nhiều nhóm đầy đủ nhưng không vượt max_applications_per_order", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ buy_quantity: 2, reward_quantity: 1, max_applications_per_order: 2 }),
      items: [makeItem({ quantity: 6 })],
      reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 2 }],
    });

    expect(result.application_count).toBe(2);
    expect(result.total_discount_vnd).toBe(90_000);
  });

  it("từ chối allocation vượt giới hạn số nhóm admin cấu hình", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({ buy_quantity: 2, reward_quantity: 1, max_applications_per_order: 1 }),
          items: [makeItem({ quantity: 6 })],
          reward_allocations: [{ client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 2 }],
        }),
      "BUNDLE_REWARD_LIMIT",
    );
  });
});
