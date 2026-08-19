import { describe, expect, it } from "vitest";
import { evaluateBundlePromotion } from "@/lib/promotionBundle";
import {
  ADDON_ID, OTHER_ID, POWDER_ID, expectReason, makeItem, makeRule,
} from "@/lib/__tests__/promotion-bundle.fixtures";

const PAID_M = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAID_L = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REWARD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const qualifier = (client_line_id: string, quantity = 1) => ({ client_line_id, quantity });
const reward = (client_line_id: string, quantity = 1) => ({ client_line_id, quantity });

describe("BUNDLE sản phẩm — cấu hình linh hoạt và baseline động", () => {
  it("SAME_CONFIG dùng giá qualifier size nhỏ nhất làm mức miễn", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ buy_quantity: 2 }),
      items: [
        makeItem({ client_line_id: PAID_M, size: "MEDIUM", quantity: 1, unit_price_vnd: 50_000 }),
        makeItem({ client_line_id: PAID_L, size: "LARGE", quantity: 1, unit_price_vnd: 65_000 }),
        makeItem({ client_line_id: REWARD, size: "LARGE", selected_powder_id: OTHER_ID,
          selected_milk_type_id: OTHER_ID, quantity: 1, unit_price_vnd: 70_000 }),
      ],
      qualifier_allocations: [qualifier(PAID_M), qualifier(PAID_L)],
      reward_allocations: [reward(REWARD)],
    });
    expect(result.application_count).toBe(1);
    expect(result.total_discount_vnd).toBe(50_000);
  });

  it("SAME_CONFIG cho đổi bột sữa và cap discount khi quà rẻ hơn", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({ client_line_id: PAID_M, quantity: 1, unit_price_vnd: 55_000 }),
        makeItem({ client_line_id: REWARD, selected_powder_id: OTHER_ID,
          selected_milk_type_id: OTHER_ID, quantity: 1, unit_price_vnd: 40_000 }),
      ],
      qualifier_allocations: [qualifier(PAID_M)],
      reward_allocations: [reward(REWARD)],
    });
    expect(result.total_discount_vnd).toBe(40_000);
  });

  it("SAME_CONFIG không cho A+B cấu thành một lượt", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule({ buy_quantity: 2, qualifier_products: [
        ...makeRule().qualifier_products,
        { menu_item_id: OTHER_ID, allowed_sizes: ["MEDIUM"], default_powder_id: POWDER_ID,
          default_base_liquid_id: null, baseline_prices_vnd: {} },
      ] }),
      items: [
        makeItem({ client_line_id: PAID_M, quantity: 1 }),
        makeItem({ client_line_id: PAID_L, menu_item_id: OTHER_ID, size: "MEDIUM", quantity: 1 }),
        makeItem({ client_line_id: REWARD, quantity: 1 }),
      ],
      qualifier_allocations: [qualifier(PAID_M), qualifier(PAID_L)],
      reward_allocations: [reward(REWARD)],
    }), "BUNDLE_NOT_ELIGIBLE");
  });

  it("cho phép cùng line quantity ba chia hai qualifier và một reward", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ buy_quantity: 2 }),
      items: [makeItem({ client_line_id: PAID_M, quantity: 3 })],
      qualifier_allocations: [qualifier(PAID_M, 2)],
      reward_allocations: [reward(PAID_M)],
    });
    expect(result.total_discount_vnd).toBe(45_000);
  });

  it("không đưa addon trả phí vào mức miễn", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule(),
      items: [
        makeItem({ client_line_id: PAID_M, quantity: 1 }),
        makeItem({ client_line_id: REWARD, quantity: 1,
          addons: [{ addon_option_id: ADDON_ID, quantity: 1, unit_price_vnd: 15_000, gram_value: null }] }),
      ],
      qualifier_allocations: [qualifier(PAID_M)],
      reward_allocations: [reward(REWARD)],
    });
    expect(result.total_discount_vnd).toBe(45_000);
  });

  it("FIXED_CONFIG cho đổi cấu hình và miễn baseline động của size", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ reward_mode: "FIXED_CONFIG", reward_products: [{
        menu_item_id: OTHER_ID, allowed_sizes: ["MEDIUM", "LARGE"], default_powder_id: POWDER_ID,
        default_base_liquid_id: null, baseline_prices_vnd: { MEDIUM: 50_000, LARGE: 60_000 },
      }] }),
      items: [
        makeItem({ client_line_id: PAID_M, quantity: 1 }),
        makeItem({ client_line_id: REWARD, menu_item_id: OTHER_ID, size: "LARGE",
          selected_powder_id: OTHER_ID, selected_milk_type_id: OTHER_ID, quantity: 1, unit_price_vnd: 72_000 }),
      ],
      qualifier_allocations: [qualifier(PAID_M)],
      reward_allocations: [reward(REWARD)],
    });
    expect(result.total_discount_vnd).toBe(60_000);
  });

  it("ALLOWED_SCOPE cap discount khi reward rẻ hơn baseline", () => {
    const result = evaluateBundlePromotion({
      rule: makeRule({ reward_mode: "ALLOWED_SCOPE", reward_products: [{
        menu_item_id: OTHER_ID, allowed_sizes: ["SMALL"], default_powder_id: POWDER_ID,
        default_base_liquid_id: null, baseline_prices_vnd: { SMALL: 55_000 },
      }] }),
      items: [
        makeItem({ client_line_id: PAID_M, quantity: 1 }),
        makeItem({ client_line_id: REWARD, menu_item_id: OTHER_ID, quantity: 1, unit_price_vnd: 40_000 }),
      ],
      qualifier_allocations: [qualifier(PAID_M)], reward_allocations: [reward(REWARD)],
    });
    expect(result.total_discount_vnd).toBe(40_000);
  });

  it("từ chối reward size ngoài scope", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule({ reward_mode: "ALLOWED_SCOPE", reward_products: [{
        menu_item_id: OTHER_ID, allowed_sizes: ["MEDIUM"], default_powder_id: POWDER_ID,
        default_base_liquid_id: null, baseline_prices_vnd: { MEDIUM: 50_000 },
      }] }),
      items: [makeItem({ client_line_id: PAID_M, quantity: 1 }),
        makeItem({ client_line_id: REWARD, menu_item_id: OTHER_ID, size: "LARGE", quantity: 1 })],
      qualifier_allocations: [qualifier(PAID_M)], reward_allocations: [reward(REWARD)],
    }), "BUNDLE_SCOPE_MISMATCH");
  });

  it("không dùng unit có PRODUCT voucher", () => {
    expectReason(() => evaluateBundlePromotion({
      rule: makeRule(), items: [makeItem({ quantity: 2, product_voucher_quantity: 1 })],
      qualifier_allocations: [qualifier(PAID_M)], reward_allocations: [reward(PAID_M)],
    }), "BUNDLE_CONFLICT");
  });
});
