import { describe, expect, it } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";
import { projectBundleApplications, projectCartTotals, type VoucherProjectionSource } from "@/src/lib/utils/bundleVoucherProjection";
import { buildBundleApplication, deriveBundleSelectionState, summarizeBundleCart, type BundleVoucherSummary } from "@/src/lib/utils/bundleVoucher";

const BUNDLE_LINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISCOUNT_LINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BUNDLE_TOKEN = "bundle-token";
const PRODUCT_DISCOUNT_TOKEN = "product-discount-token";
const MENU_A = "menu-a";
const MENU_B = "menu-b";

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: BUNDLE_LINE,
    menuItemId: "menu-a",
    name: "Matcha",
    category: "latte",
    imageUrl: null,
    size: "SMALL",
    unitPrice: 45_000,
    quantity: 2,
    sweetness: "FULL",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    addonsPrice: 0,
    addonPrices: {},
    clientPriceVnd: 45_000,
    originalClientPriceVnd: 45_000,
    ...overrides,
  };
}

function bundleVoucher(token = BUNDLE_TOKEN): VoucherProjectionSource {
  return {
    qr_token: token,
    voucher_type: "BUNDLE",
    discount_type: null,
    discount_value: null,
    max_discount_vnd: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    status: "ACTIVE",
    package: {
      name: "Mua 1 tặng 1",
      description: null,
      points_cost: 0,
      bundleRule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_per_order: 1,
        max_reward_units_per_order: null,
        qualifier_products: [{ menu_item_id: "menu-a", default_powder_id: null, default_base_liquid_id: null, allowed_sizes: ["SMALL"], baseline_prices_vnd: {}, menu_item: { name: "Matcha", category: "latte", is_available: true } }],
        reward_products: [],
        reward_addon_option_ids: [],
      },
    },
  };
}

describe("Projection BUNDLE và PRODUCT_DISCOUNT", () => {
  it("giữ snapshot group và metadata addon theo đúng số unit trong cart line", () => {
    const [line] = summarizeBundleCart([cartItem({
      quantity: 2,
      selectedOptionIds: ["topping-1"],
      addonsPrice: 10_000,
      addonPrices: { "topping-1": 10_000 },
      addonMetadata: {
        "topping-1": {
          addon_group_id: "group-1",
          max_select: 2,
          gram_value: null,
          is_active: true,
          is_deleted: false,
          is_dynamic_gram: false,
        },
      },
    })]);

    expect(line?.addons).toEqual([expect.objectContaining({
      addon_option_id: "topping-1",
      addon_group_id: "group-1",
      max_select: 2,
      quantity: 2,
      gram_value: null,
      is_active: true,
      is_deleted: false,
      is_dynamic_gram: false,
    })]);
  });

  it("chặn Extra Matcha hoặc addon đã bị ngưng khi projection revalidate", () => {
    const addonVoucher = bundleVoucher();
    addonVoucher.package.bundleRule = {
      ...addonVoucher.package.bundleRule!,
      reward_kind: "ADDON",
      reward_mode: "ALLOWED_SCOPE",
      reward_addon_option_ids: ["extra-matcha"],
    };
    const extraMatchaItem = cartItem({
      quantity: 1,
      selectedOptionIds: ["extra-matcha"],
      addonsPrice: 12_000,
      addonPrices: { "extra-matcha": 12_000 },
      addonMetadata: {
        "extra-matcha": { gram_value: 2, is_dynamic_gram: true, is_active: true, is_deleted: false },
      },
    });
    const extraResult = projectBundleApplications(
      [extraMatchaItem],
      [{ voucher_qr_token: BUNDLE_TOKEN, owner_key: "owner", qualifier_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }], reward_allocations: [{ client_line_id: BUNDLE_LINE, addon_option_id: "extra-matcha", quantity: 1 }], created_reward_effects: [] }],
      [addonVoucher],
    );
    expect(extraResult.error_by_token.get(BUNDLE_TOKEN)).toContain("Extra Matcha");

    const inactiveItem = { ...extraMatchaItem, addonMetadata: { "extra-matcha": { gram_value: null, is_dynamic_gram: false, is_active: false, is_deleted: false } } };
    const inactiveResult = projectBundleApplications(
      [inactiveItem],
      [{ voucher_qr_token: BUNDLE_TOKEN, owner_key: "owner", qualifier_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }], reward_allocations: [{ client_line_id: BUNDLE_LINE, addon_option_id: "extra-matcha", quantity: 1 }], created_reward_effects: [] }],
      [addonVoucher],
    );
    expect(inactiveResult.error_by_token.get(BUNDLE_TOKEN)).toContain("no longer available");
  });

  it("giữ phần tiền còn trả của PRODUCT_DISCOUNT ngoài BUNDLE", () => {
    const result = projectCartTotals({
      items: [
        cartItem(),
        cartItem({
          cartId: DISCOUNT_LINE,
          menuItemId: "menu-b",
          name: "Fusion",
          quantity: 1,
          unitPrice: 35_000,
          clientPriceVnd: 35_000,
          originalClientPriceVnd: 45_000,
          productVoucherId: PRODUCT_DISCOUNT_TOKEN,
          productVoucherType: "PRODUCT_DISCOUNT",
          productVoucherDiscountVnd: 10_000,
        }),
      ],
      applications: [{
        voucher_qr_token: BUNDLE_TOKEN,
        owner_key: "owner",
        qualifier_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }],
        reward_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }],
        created_reward_effects: [],
      }],
      vouchers: [bundleVoucher()],
      selectedVoucherIds: [],
      shipping_fee_vnd: 0,
    });

    expect(result.bundles.bundle_discount_vnd).toBe(45_000);
    expect(result.totals.items_discount_vnd).toBe(55_000);
    expect(result.totals.total_vnd).toBe(80_000);
  });

  it("chỉ gắn lỗi projection cho application BUNDLE liên quan", () => {
    const invalidToken = "invalid-bundle-token";
    const result = projectCartTotals({
      items: [cartItem({ quantity: 4 })],
      applications: [
        {
          voucher_qr_token: BUNDLE_TOKEN,
          owner_key: "owner",
          qualifier_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }],
          reward_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }],
          created_reward_effects: [],
        },
        {
          voucher_qr_token: invalidToken,
          owner_key: "owner",
          qualifier_allocations: [{ client_line_id: BUNDLE_LINE, quantity: 1 }],
          reward_allocations: [{ client_line_id: "missing-line", quantity: 1 }],
          created_reward_effects: [],
        },
      ],
      vouchers: [bundleVoucher(), bundleVoucher(invalidToken)],
      selectedVoucherIds: [],
      shipping_fee_vnd: 0,
    });

    expect(result.bundles.error_by_token.has(invalidToken)).toBe(true);
    expect(result.bundles.error_by_token.has(BUNDLE_TOKEN)).toBe(false);
  });

  it("dùng chung planner để hoàn tất qualifier theo scope thay vì thứ tự cart", () => {
    const summary: BundleVoucherSummary = {
      qr_token: BUNDLE_TOKEN,
      buy_quantity: 2,
      reward_quantity: 1,
      reward_kind: "PRODUCT",
      reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE",
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
      reward_addon_option_ids: [],
      eligible_products: [
        { menu_item_id: MENU_A, allowed_sizes: ["SMALL"] },
        { menu_item_id: MENU_B, allowed_sizes: ["SMALL"] },
      ],
      reward_products: [],
      min_order_vnd: null,
    };
    const cart = [
      { client_line_id: "line-b", menu_item_id: MENU_B, size: "SMALL" as const, label: "B", quantity: 1, unit_price_vnd: 45_000, product_voucher_quantity: 0, addons: [] },
      { client_line_id: "line-a", menu_item_id: MENU_A, size: "SMALL" as const, label: "A", quantity: 3, unit_price_vnd: 45_000, product_voucher_quantity: 0, addons: [] },
    ];
    const rewardAllocations = [{ client_line_id: "line-a", quantity: 1 }];
    const application = buildBundleApplication({ voucher: summary, cart, rewardAllocations });

    expect(application?.qualifier_allocations).toEqual([{ client_line_id: "line-a", quantity: 2 }]);
    expect(deriveBundleSelectionState({ voucher: summary, cart, allocations: rewardAllocations }).status).toBe("READY");
  });
});
