import { describe, expect, it } from "vitest";
import { evaluateBundleApplications, evaluateBundlePromotion } from "@/lib/promotionBundle";
import { ADDON_ID, expectReason, makeItem, makeRule } from "@/lib/__tests__/promotion-bundle.fixtures";
import { bundleProductUnitUsage } from "@/src/utils/bundlePromotion";

const QUALIFIER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECIPIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SIBLING_QUALIFIER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECOND_ADDON_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const qualifier = (client_line_id: string, quantity = 1) => ({ client_line_id, quantity });
const addonReward = (client_line_id: string, quantity = 1) => ({ client_line_id, addon_option_id: ADDON_ID, quantity });
const addon = (quantity: number, gram_value: number | null = null, addon_option_id = ADDON_ID) => ({ addon_option_id, quantity, unit_price_vnd: 15_000, gram_value });

function addonRule(overrides: Parameters<typeof makeRule>[0] = {}) {
  return makeRule({
    reward_kind: "ADDON",
    reward_mode: "ALLOWED_SCOPE",
    reward_quantity: 1,
    reward_addon_option_ids: [ADDON_ID],
    ...overrides,
  });
}

describe("BUNDLE addon evaluator recipient pool", () => {
  it("accepts a non-qualifier eligible line and scales PER_BUNDLE Y=2", () => {
    const result = evaluateBundlePromotion({
      rule: addonRule({ reward_quantity: 2 }),
      items: [
        makeItem({ client_line_id: QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 2, addons: [addon(2)] }),
      ],
      qualifier_allocations: [qualifier(QUALIFIER)],
      reward_allocations: [addonReward(RECIPIENT, 2)],
    });

    expect(result.application_count).toBe(1);
    expect(result.total_discount_vnd).toBe(30_000);
  });

  it("uses exact ONCE and PER_ITEM totals with a reward cap", () => {
    const once = evaluateBundlePromotion({
      rule: addonRule({ benefit_scaling: "ONCE_PER_ORDER", buy_quantity: 2, reward_quantity: 3 }),
      items: [makeItem({ client_line_id: QUALIFIER, quantity: 3, addons: [addon(3)] })],
      qualifier_allocations: [qualifier(QUALIFIER, 2)],
      reward_allocations: [addonReward(QUALIFIER, 3)],
    });
    const perItem = evaluateBundlePromotion({
      rule: addonRule({ benefit_scaling: "PER_QUALIFYING_ITEM", buy_quantity: 1, reward_quantity: 2, max_applications_per_order: 3, max_reward_units_per_order: 3 }),
      items: [makeItem({ client_line_id: QUALIFIER, quantity: 3, addons: [addon(3)] })],
      qualifier_allocations: [qualifier(QUALIFIER, 3)],
      reward_allocations: [addonReward(QUALIFIER, 3)],
    });

    expect(once.total_discount_vnd).toBe(45_000);
    expect(perItem.application_count).toBe(3);
    expect(perItem.total_discount_vnd).toBe(45_000);
  });

  it("rejects a recipient unit with a personal product voucher", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: addonRule(),
      items: [
        makeItem({ client_line_id: QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 1, product_voucher_quantity: 1, addons: [addon(1)] }),
      ],
      qualifier_allocations: [qualifier(QUALIFIER)],
      reward_allocations: [addonReward(RECIPIENT)],
    }), "BUNDLE_CONFLICT");
  });

  it("rejects recipient unit reuse across sibling applications", () => {
    const rule = addonRule();
    expectReason(() => evaluateBundleApplications({
      items: [
        makeItem({ client_line_id: QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: SIBLING_QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 1, addons: [addon(2)] }),
      ],
      applications: [
        { voucher_qr_token: "bundle-addon-a", rule, qualifier_allocations: [qualifier(QUALIFIER)], reward_allocations: [addonReward(RECIPIENT)] },
        { voucher_qr_token: "bundle-addon-b", rule, qualifier_allocations: [qualifier(SIBLING_QUALIFIER)], reward_allocations: [addonReward(RECIPIENT)] },
      ],
    }), "BUNDLE_ALLOCATION_OVERLAP");
  });

  it("báo overlap aggregate addon sau khi từng voucher đã trừ capacity cá nhân", () => {
    const rule = addonRule({ max_applications_per_order: 3 });
    expectReason(() => evaluateBundleApplications({
      items: [
        makeItem({ client_line_id: "qualifier-a", quantity: 1 }),
        makeItem({ client_line_id: "qualifier-b", quantity: 1 }),
        makeItem({ client_line_id: "qualifier-c", quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 3, addons: [{ ...addon(3), personal_voucher_quantity: 1 }] }),
      ],
      applications: [
        { voucher_qr_token: "bundle-personal-addon-a", rule, qualifier_allocations: [qualifier("qualifier-a")], reward_allocations: [addonReward(RECIPIENT)] },
        { voucher_qr_token: "bundle-personal-addon-b", rule, qualifier_allocations: [qualifier("qualifier-b")], reward_allocations: [addonReward(RECIPIENT)] },
        { voucher_qr_token: "bundle-personal-addon-c", rule, qualifier_allocations: [qualifier("qualifier-c")], reward_allocations: [addonReward(RECIPIENT)] },
      ],
    }), "BUNDLE_ALLOCATION_OVERLAP");
  });

  it("rejects zero gram addon metadata", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: addonRule(),
      items: [makeItem({ client_line_id: QUALIFIER }), makeItem({ client_line_id: RECIPIENT, addons: [addon(1, 0)] })],
      qualifier_allocations: [qualifier(QUALIFIER)],
      reward_allocations: [addonReward(RECIPIENT)],
    }), "BUNDLE_EXTRA_MATCHA_BLOCKED");
  });

  it("shares one physical recipient across different addon options within one application", () => {
    const rule = addonRule({ reward_quantity: 2, reward_addon_option_ids: [ADDON_ID, SECOND_ADDON_ID] });
    const qualifiers = [qualifier(QUALIFIER)];
    const rewards = [addonReward(RECIPIENT), { client_line_id: RECIPIENT, addon_option_id: SECOND_ADDON_ID, quantity: 1 }];
    expect(bundleProductUnitUsage(rule, qualifiers, rewards).get(RECIPIENT)).toBe(1);
    const result = evaluateBundlePromotion({
      rule,
      items: [
        makeItem({ client_line_id: QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 1, addons: [addon(1), addon(1, null, SECOND_ADDON_ID)] }),
      ],
      qualifier_allocations: qualifiers,
      reward_allocations: rewards,
    });
    expect(result.total_discount_vnd).toBe(30_000);
    expectReason(() => evaluateBundleApplications({
      items: [
        makeItem({ client_line_id: QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: SIBLING_QUALIFIER, quantity: 1 }),
        makeItem({ client_line_id: RECIPIENT, quantity: 1, addons: [addon(1), addon(1, null, SECOND_ADDON_ID)] }),
      ],
      applications: [
        { voucher_qr_token: "bundle-addon-a", rule, qualifier_allocations: [qualifier(QUALIFIER)], reward_allocations: [addonReward(RECIPIENT)] },
        { voucher_qr_token: "bundle-addon-b", rule, qualifier_allocations: [qualifier(SIBLING_QUALIFIER)], reward_allocations: [{ client_line_id: RECIPIENT, addon_option_id: SECOND_ADDON_ID, quantity: 1 }] },
      ],
    }), "BUNDLE_ALLOCATION_OVERLAP");
  });
});
