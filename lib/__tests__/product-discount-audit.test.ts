import { describe, it } from "vitest";
import { evaluateBundlePromotion } from "@/lib/promotionBundle";
import { expectReason, makeItem, makeRule } from "@/lib/__tests__/promotion-bundle.fixtures";

const LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const allocation = { client_line_id: LINE, quantity: 1 };

describe("BUNDLE với PRODUCT_DISCOUNT một phần", () => {
  it("không cho unit giảm một phần làm qualifier", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule(),
      items: [makeItem({ client_line_id: LINE, quantity: 2, product_discount_voucher_quantity: 1, product_discount_vnd: 10_000 })],
      qualifier_allocations: [allocation], reward_allocations: [allocation],
    }), "BUNDLE_CONFLICT");
  });

  it("không cho unit giảm một phần làm reward", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({ client_line_id: LINE, quantity: 1 }),
        makeItem({ client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantity: 1, product_discount_voucher_quantity: 1 }),
      ],
      qualifier_allocations: [allocation],
      reward_allocations: [{ client_line_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantity: 1 }],
    }), "BUNDLE_CONFLICT");
  });

  it("không cho unit PRODUCT_DISCOUNT không có lợi ích làm reward", () => {
    const rewardLine = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({ client_line_id: LINE, quantity: 1 }),
        makeItem({ client_line_id: rewardLine, quantity: 1, product_discount_voucher_quantity: 1, product_discount_vnd: 0 }),
      ],
      qualifier_allocations: [allocation], reward_allocations: [{ client_line_id: rewardLine, quantity: 1 }],
    }), "BUNDLE_CONFLICT");
  });

  it("min_order vẫn tính phần còn phải trả của unit giảm một phần ngoài BUNDLE", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule({ min_order_vnd: 81_000 }),
      items: [makeItem({ client_line_id: LINE, quantity: 3, unit_price_vnd: 45_000, product_discount_voucher_quantity: 1, product_discount_vnd: 10_000 })],
      qualifier_allocations: [{ client_line_id: LINE, quantity: 1 }],
      reward_allocations: [{ client_line_id: LINE, quantity: 1 }],
    }), "BUNDLE_MIN_ORDER_NOT_MET");
  });
});
