import { describe, expect, it } from "vitest";
import { autofillBundleSelection, planBundleSelection } from "@/src/utils/bundleSelection";
import type { BundleCartItem, BundlePromotionRule } from "@/src/utils/bundlePromotion";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADDON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECOND_ADDON = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function item(line: string, overrides: Partial<BundleCartItem> = {}): BundleCartItem {
  return {
    client_line_id: line,
    menu_item_id: "menu-a",
    size: "SMALL",
    selected_powder_id: "powder-a",
    selected_milk_type_id: "milk-a",
    unit_price_vnd: 45_000,
    quantity: 1,
    product_voucher_quantity: 0,
    addons: [],
    ...overrides,
  };
}

function productRule(overrides: Partial<BundlePromotionRule> = {}): BundlePromotionRule {
  return {
    min_order_vnd: null,
    buy_quantity: 2,
    reward_quantity: 1,
    reward_kind: "PRODUCT",
    reward_mode: "SAME_CONFIG",
    benefit_scaling: "PER_BUNDLE",
    max_applications_per_order: 1,
    max_reward_units_per_order: null,
    qualifier_products: [{ menu_item_id: "menu-a", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: {} }],
    reward_products: [],
    reward_addon_option_ids: [],
    ...overrides,
  };
}

describe("Planner BUNDLE dùng lựa chọn tường minh", () => {
  it("giữ qualifier đã chọn và gộp allocation lặp trên cùng line", () => {
    const plan = planBundleSelection({
      items: [item(A, { quantity: 3 })],
      voucher_qr_token: "bundle-a",
      rule: productRule(),
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }, { client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, quantity: 1 }],
    });

    expect(plan.status).toBe("READY");
    expect(plan.qualifier_allocations).toEqual([{ client_line_id: A, quantity: 2 }]);
    expect(plan.total_discount_vnd).toBe(45_000);
  });

  it("báo conflict khi selection đụng capacity của voucher anh em", () => {
    const rule = productRule({ buy_quantity: 1 });
    const plan = planBundleSelection({
      items: [item(A, { quantity: 3 })],
      voucher_qr_token: "bundle-b",
      rule,
      sibling_applications: [{
        voucher_qr_token: "bundle-a",
        rule,
        qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
        reward_allocations: [{ client_line_id: A, quantity: 1 }],
      }],
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, quantity: 1 }],
    });

    expect(plan.status).toBe("CONFLICT");
    expect(plan.reason?.code).toBe("BUNDLE_ALLOCATION_OVERLAP");
    expect(plan.reason?.voucher_qr_token).toBe("bundle-b");
  });

  it("chuẩn hóa addon quantity lớn hơn một theo scaling từng qualifying item", () => {
    const plan = planBundleSelection({
      items: [item(A, {
        quantity: 2,
        addons: [{ addon_option_id: ADDON, quantity: 2, unit_price_vnd: 10_000, gram_value: null }],
      })],
      voucher_qr_token: "bundle-addon",
      rule: productRule({ reward_kind: "ADDON", reward_mode: "ALLOWED_SCOPE", benefit_scaling: "PER_QUALIFYING_ITEM", reward_quantity: 1, reward_addon_option_ids: [ADDON] }),
      qualifier_allocations: [{ client_line_id: A, quantity: 2 }],
      reward_allocations: [{ client_line_id: A, addon_option_id: ADDON, quantity: 1 }, { client_line_id: A, addon_option_id: ADDON, quantity: 1 }],
    });

    expect(plan.status).toBe("READY");
    expect(plan.reward_allocations).toEqual([{ client_line_id: A, addon_option_id: ADDON, quantity: 2 }]);
    expect(plan.total_discount_vnd).toBe(20_000);
  });

  it("dùng chung recipient unit cho hai option addon khi autofill và planner", () => {
    const rule = productRule({ buy_quantity: 1, reward_kind: "ADDON", reward_mode: "ALLOWED_SCOPE", reward_quantity: 2, reward_addon_option_ids: [ADDON, SECOND_ADDON] });
    const input = {
      items: [item(A, { addons: [
        { addon_option_id: ADDON, quantity: 1, unit_price_vnd: 10_000, gram_value: null },
        { addon_option_id: SECOND_ADDON, quantity: 1, unit_price_vnd: 10_000, gram_value: null },
      ] })],
      voucher_qr_token: "bundle-addon-two-options",
      rule,
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [
        { client_line_id: A, addon_option_id: ADDON, quantity: 1 },
        { client_line_id: A, addon_option_id: SECOND_ADDON, quantity: 1 },
      ],
    };
    const application = autofillBundleSelection(input);
    expect(application.reward_allocations).toEqual(input.reward_allocations);
    const plan = planBundleSelection(input);
    expect(plan.status).toBe("READY");
    expect(plan.total_discount_vnd).toBe(20_000);
  });

  it("cho phép trộn qualifier scope với FIXED hoặc ALLOWED", () => {
    const plan = planBundleSelection({
      items: [item(A), item(B, { menu_item_id: "menu-b", quantity: 2 })],
      voucher_qr_token: "bundle-mix",
      rule: productRule({
        reward_mode: "ALLOWED_SCOPE",
        qualifier_products: [
          { menu_item_id: "menu-a", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: {} },
          { menu_item_id: "menu-b", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: {} },
        ],
        reward_products: [{ menu_item_id: "menu-b", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: { SMALL: 45_000 } }],
      }),
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }, { client_line_id: B, quantity: 1 }],
      reward_allocations: [{ client_line_id: B, quantity: 1 }],
    });

    expect(plan.status).toBe("READY");
  });

  it("autofill SAME_CONFIG chọn group cùng menu theo thứ tự cart", () => {
    const application = autofillBundleSelection({
      items: [item(A, { quantity: 3 }), item(B, { quantity: 3 })],
      voucher_qr_token: "bundle-auto",
      rule: productRule(),
    });

    expect(application.qualifier_allocations).toEqual([{ client_line_id: A, quantity: 2 }]);
    expect(application.reward_allocations).toEqual([{ client_line_id: A, quantity: 1 }]);
  });

  it("autofill SAME_CONFIG ưu tiên group hoàn chỉnh theo thứ tự scope", () => {
    const application = autofillBundleSelection({
      items: [
        item(B, { menu_item_id: "menu-b", quantity: 1 }),
        item(A, { menu_item_id: "menu-a", quantity: 3 }),
      ],
      voucher_qr_token: "bundle-scope-order",
      rule: productRule({
        qualifier_products: [
          { menu_item_id: "menu-a", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: {} },
          { menu_item_id: "menu-b", allowed_sizes: ["SMALL"], default_powder_id: "powder-a", default_base_liquid_id: "milk-a", baseline_prices_vnd: {} },
        ],
      }),
    });

    expect(application.qualifier_allocations).toEqual([{ client_line_id: A, quantity: 2 }]);
    expect(application.reward_allocations).toEqual([{ client_line_id: A, quantity: 1 }]);
  });

  it("gán lỗi vào sibling BUNDLE không hợp lệ thay vì token đang sửa", () => {
    const rule = productRule({ buy_quantity: 1 });
    const plan = planBundleSelection({
      items: [item(A, { quantity: 2 })],
      voucher_qr_token: "bundle-editing",
      rule,
      sibling_applications: [{
        voucher_qr_token: "bundle-invalid-sibling",
        rule,
        qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
        reward_allocations: [{ client_line_id: "missing-line", quantity: 1 }],
      }],
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, quantity: 1 }],
    });

    expect(plan.status).toBe("CONFLICT");
    expect(plan.reason?.voucher_qr_token).toBe("bundle-invalid-sibling");
    expect(plan.reason?.code).toBe("BUNDLE_SCOPE_MISMATCH");
  });

  it("giữ token sibling gây lỗi khi hai sibling tự đụng cùng unit", () => {
    const rule = productRule({ buy_quantity: 1 });
    const plan = planBundleSelection({
      items: [item(A, { quantity: 2 })],
      voucher_qr_token: "bundle-editing",
      rule,
      sibling_applications: [
        { voucher_qr_token: "bundle-sibling-1", rule, qualifier_allocations: [{ client_line_id: A, quantity: 1 }], reward_allocations: [{ client_line_id: A, quantity: 1 }] },
        { voucher_qr_token: "bundle-sibling-2", rule, qualifier_allocations: [{ client_line_id: A, quantity: 1 }], reward_allocations: [{ client_line_id: A, quantity: 1 }] },
      ],
    });

    expect(plan.reason?.code).toBe("BUNDLE_ALLOCATION_OVERLAP");
    expect(plan.reason?.voucher_qr_token).toBe("bundle-sibling-2");
  });

  it("phân biệt reuse unit sạch với thiếu capacity do voucher cá nhân", () => {
    const rule = productRule({ buy_quantity: 1 });
    const clean = planBundleSelection({
      items: [item(A, { quantity: 1 })],
      voucher_qr_token: "bundle-clean",
      rule,
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, quantity: 1 }],
    });
    const personal = planBundleSelection({
      items: [item(A, { quantity: 1, product_voucher_quantity: 1 })],
      voucher_qr_token: "bundle-personal",
      rule,
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, quantity: 1 }],
    });

    expect(clean.reason?.code).toBe("BUNDLE_ALLOCATION_OVERLAP");
    expect(personal.reason?.code).toBe("BUNDLE_CONFLICT");
  });

  it("ưu tiên báo overlap khi current vừa đủ nhưng sibling làm đầy capacity product và addon", () => {
    const product = planBundleSelection({
      items: [item(A, { quantity: 3, product_voucher_quantity: 1 })],
      voucher_qr_token: "bundle-current-product",
      rule: productRule({ buy_quantity: 1 }),
      sibling_applications: [{
        voucher_qr_token: "bundle-sibling-product",
        rule: productRule({ buy_quantity: 1 }),
        qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
        reward_allocations: [{ client_line_id: A, quantity: 1 }],
      }],
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
    });
    const addonRule = productRule({ reward_kind: "ADDON", reward_mode: "ALLOWED_SCOPE", buy_quantity: 1, reward_quantity: 2, reward_addon_option_ids: [ADDON] });
    const addon = planBundleSelection({
      items: [item(A, { quantity: 3, product_voucher_quantity: 1, addons: [{ addon_option_id: ADDON, quantity: 3, unit_price_vnd: 10_000, gram_value: null, personal_voucher_quantity: 1 }] })],
      voucher_qr_token: "bundle-current-addon",
      rule: addonRule,
      sibling_applications: [{
        voucher_qr_token: "bundle-sibling-addon",
        rule: addonRule,
        qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
        reward_allocations: [{ client_line_id: A, addon_option_id: ADDON, quantity: 2 }],
      }],
      qualifier_allocations: [{ client_line_id: A, quantity: 1 }],
      reward_allocations: [{ client_line_id: A, addon_option_id: ADDON, quantity: 1 }],
    });

    expect(product.reason?.code).toBe("BUNDLE_ALLOCATION_OVERLAP");
    expect(product.reason?.voucher_qr_token).toBe("bundle-current-product");
    expect(addon.reason?.code).toBe("BUNDLE_ALLOCATION_OVERLAP");
    expect(addon.reason?.voucher_qr_token).toBe("bundle-current-addon");
  });
});
