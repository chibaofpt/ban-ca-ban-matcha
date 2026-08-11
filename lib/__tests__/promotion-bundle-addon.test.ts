import { describe, expect, it } from "vitest";
import { evaluateBundlePromotion } from "@/lib/promotionBundle";
import {
  ADDON_ID,
  expectReason,
  makeItem,
  makeRule,
} from "@/lib/__tests__/promotion-bundle.fixtures";

describe("BUNDLE addon — quà chung và quà theo từng món", () => {
  it("mua đủ X → tặng N addon chung của đơn", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({
        buy_quantity: 2,
        reward_quantity: 2,
        reward_kind: "ADDON",
        reward_mode: "ALLOWED_SCOPE",
        benefit_scaling: "ONCE_PER_ORDER",
        reward_addon_option_ids: [ADDON_ID],
      }),
      items: [
        makeItem({
          quantity: 2,
          addons: [{ addon_option_id: ADDON_ID, quantity: 2, unit_price_vnd: 10_000, gram_value: null }],
        }),
      ],
      reward_allocations: [
        {
          client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          addon_option_id: ADDON_ID,
          quantity: 2,
        },
      ],
    });

    expect(result.application_count).toBe(1);
    expect(result.total_discount_vnd).toBe(20_000);
  });

  it("mua đủ X → tặng N addon trên mỗi món đủ điều kiện", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({
        buy_quantity: 2,
        reward_quantity: 2,
        reward_kind: "ADDON",
        reward_mode: "ALLOWED_SCOPE",
        benefit_scaling: "PER_QUALIFYING_ITEM",
        reward_addon_option_ids: [ADDON_ID],
      }),
      items: [
        makeItem({
          quantity: 2,
          addons: [{ addon_option_id: ADDON_ID, quantity: 4, unit_price_vnd: 10_000, gram_value: null }],
        }),
      ],
      reward_allocations: [
        {
          client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          addon_option_id: ADDON_ID,
          quantity: 4,
        },
      ],
    });

    expect(result.total_discount_vnd).toBe(40_000);
  });

  it("từ chối addon quà không tồn tại trong addon thật của món", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({
            buy_quantity: 2,
            reward_quantity: 1,
            reward_kind: "ADDON",
            reward_mode: "ALLOWED_SCOPE",
            benefit_scaling: "ONCE_PER_ORDER",
            reward_addon_option_ids: [ADDON_ID],
          }),
          items: [makeItem({ quantity: 2 })],
          reward_allocations: [
            {
              client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              addon_option_id: ADDON_ID,
              quantity: 1,
            },
          ],
        }),
      "BUNDLE_SCOPE_MISMATCH",
    );
  });

  it("từ chối Extra Matcha có giá động", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({
            buy_quantity: 2,
            reward_quantity: 1,
            reward_kind: "ADDON",
            reward_mode: "ALLOWED_SCOPE",
            benefit_scaling: "ONCE_PER_ORDER",
            reward_addon_option_ids: [ADDON_ID],
          }),
          items: [
            makeItem({
              quantity: 2,
              addons: [{ addon_option_id: ADDON_ID, quantity: 1, unit_price_vnd: 12_000, gram_value: 2 }],
            }),
          ],
          reward_allocations: [
            {
              client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              addon_option_id: ADDON_ID,
              quantity: 1,
            },
          ],
        }),
      "BUNDLE_EXTRA_MATCHA_BLOCKED",
    );
  });

  it("không giảm trùng addon unit đã có ADDON voucher", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({
            buy_quantity: 2,
            reward_quantity: 1,
            reward_kind: "ADDON",
            reward_mode: "ALLOWED_SCOPE",
            benefit_scaling: "ONCE_PER_ORDER",
            reward_addon_option_ids: [ADDON_ID],
          }),
          items: [
            makeItem({
              quantity: 2,
              addons: [
                {
                  addon_option_id: ADDON_ID,
                  quantity: 1,
                  unit_price_vnd: 10_000,
                  gram_value: null,
                  voucher_discounted_quantity: 1,
                },
              ],
            }),
          ],
          reward_allocations: [
            {
              client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              addon_option_id: ADDON_ID,
              quantity: 1,
            },
          ],
        }),
      "BUNDLE_CONFLICT",
    );
  });

  it("từ chối allocation trùng cùng cart line và addon", () => {
    expectReason(
      () =>
        evaluateBundlePromotion({
          rule: makeRule({
            buy_quantity: 2,
            reward_quantity: 1,
            reward_kind: "ADDON",
            reward_mode: "ALLOWED_SCOPE",
            benefit_scaling: "ONCE_PER_ORDER",
            reward_addon_option_ids: [ADDON_ID],
          }),
          items: [
            makeItem({
              quantity: 2,
              addons: [{ addon_option_id: ADDON_ID, quantity: 2, unit_price_vnd: 10_000, gram_value: null }],
            }),
          ],
          reward_allocations: [
            {
              client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              addon_option_id: ADDON_ID,
              quantity: 1,
            },
            {
              client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              addon_option_id: ADDON_ID,
              quantity: 1,
            },
          ],
        }),
      "BUNDLE_DUPLICATE_ALLOCATION",
    );
  });
});
