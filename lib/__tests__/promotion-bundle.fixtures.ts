import { expect } from "vitest";
import {
  BundlePromotionError,
  type BundleCartItem,
  type BundlePromotionRule,
} from "@/lib/promotionBundle";

export const LATTE_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_ID = "22222222-2222-4222-8222-222222222222";
export const ADDON_ID = "33333333-3333-4333-8333-333333333333";
export const POWDER_ID = "44444444-4444-4444-8444-444444444444";
const MILK_ID = "55555555-5555-4555-8555-555555555555";

/** Build one server-resolved cart item for BUNDLE evaluator tests. */
export function makeItem(overrides: Partial<BundleCartItem> = {}): BundleCartItem {
  return {
    client_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    menu_item_id: LATTE_ID,
    size: "SMALL",
    selected_powder_id: POWDER_ID,
    selected_milk_type_id: MILK_ID,
    unit_price_vnd: 45_000,
    quantity: 2,
    product_voucher_quantity: 0,
    addons: [],
    ...overrides,
  };
}

/** Build a valid baseline product BUNDLE rule for evaluator tests. */
export function makeRule(overrides: Partial<BundlePromotionRule> = {}): BundlePromotionRule {
  return {
    min_order_vnd: null,
    buy_quantity: 1,
    reward_quantity: 1,
    reward_kind: "PRODUCT",
    reward_mode: "SAME_CONFIG",
    benefit_scaling: "PER_BUNDLE",
    max_applications_per_order: 1,
    max_reward_units_per_order: null,
    qualifier_products: [{
      menu_item_id: LATTE_ID,
      allowed_sizes: ["SMALL", "MEDIUM", "LARGE"],
      default_powder_id: POWDER_ID,
      default_base_liquid_id: MILK_ID,
      baseline_prices_vnd: {},
    }],
    reward_products: [],
    reward_addon_option_ids: [],
    ...overrides,
  };
}

/** Assert that a synchronous BUNDLE evaluation fails with the expected reason. */
export function expectReason(run: () => unknown, reason: string): void {
  try {
    run();
    throw new Error("Expected BundlePromotionError");
  } catch (error) {
    expect(error).toBeInstanceOf(BundlePromotionError);
    expect((error as BundlePromotionError).reason).toBe(reason);
  }
}
