import { describe, expect, it } from "vitest";
import { evaluateBundlePromotion } from "@/lib/promotionBundle";
import {
  ADDON_ID,
  expectReason,
  makeItem,
  makeRule,
} from "@/lib/__tests__/promotion-bundle.fixtures";

const PAID_LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GIFT_LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERSONAL_LINE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("Điều kiện BUNDLE khi có voucher cá nhân", () => {
  it("loại unit có PRODUCT voucher nhưng vẫn dùng các unit sạch khác làm X", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({ client_line_id: PERSONAL_LINE, quantity: 1, product_voucher_quantity: 1 }),
        makeItem({ client_line_id: PAID_LINE, quantity: 1 }),
        makeItem({ client_line_id: GIFT_LINE, quantity: 1 }),
      ],
      reward_allocations: [{ client_line_id: GIFT_LINE, quantity: 1 }],
    });

    expect(result.application_count).toBe(1);
  });

  it("không cho unit có PRODUCT voucher trở thành quà Y", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule(),
          items: [
            makeItem({ client_line_id: PAID_LINE, quantity: 1 }),
            makeItem({ client_line_id: PERSONAL_LINE, quantity: 1, product_voucher_quantity: 1 }),
          ],
          reward_allocations: [{ client_line_id: PERSONAL_LINE, quantity: 1 }],
        }),
      "BUNDLE_CONFLICT",
    );
  });

  it("loại giá đồ uống dùng PRODUCT voucher khỏi mức đơn tối thiểu", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({ min_order_vnd: 100_000 }),
          items: [
            makeItem({ client_line_id: PERSONAL_LINE, unit_price_vnd: 100_000, quantity: 1, product_voucher_quantity: 1 }),
            makeItem({ client_line_id: PAID_LINE, unit_price_vnd: 45_000, quantity: 1 }),
            makeItem({ client_line_id: GIFT_LINE, unit_price_vnd: 45_000, quantity: 1 }),
          ],
          reward_allocations: [{ client_line_id: GIFT_LINE, quantity: 1 }],
        }),
      "BUNDLE_MIN_ORDER_NOT_MET",
    );
  });

  it("loại đúng addon unit có ADDON voucher khỏi mức tối thiểu", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ min_order_vnd: 100_000 }),
      items: [
        makeItem({
          client_line_id: PAID_LINE,
          quantity: 1,
          unit_price_vnd: 45_000,
          addons: [{
            addon_option_id: ADDON_ID,
            quantity: 2,
            unit_price_vnd: 10_000,
            gram_value: null,
            voucher_discounted_quantity: 1,
          }],
        }),
        makeItem({ client_line_id: GIFT_LINE, quantity: 1, unit_price_vnd: 45_000 }),
      ],
      reward_allocations: [{ client_line_id: GIFT_LINE, quantity: 1 }],
    });

    expect(result.application_count).toBe(1);
  });

  it("không tính shipping vào mức đơn tối thiểu vì evaluator không nhận shipping", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({ min_order_vnd: 91_000 }),
          items: [
            makeItem({ client_line_id: PAID_LINE, quantity: 1, unit_price_vnd: 45_000 }),
            makeItem({ client_line_id: GIFT_LINE, quantity: 1, unit_price_vnd: 45_000 }),
          ],
          reward_allocations: [{ client_line_id: GIFT_LINE, quantity: 1 }],
        }),
      "BUNDLE_MIN_ORDER_NOT_MET",
    );
  });
});
