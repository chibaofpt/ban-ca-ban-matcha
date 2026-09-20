import { describe, expect, it, vi } from "vitest";

import { WELCOME_REWARD_INCLUDE, toWelcomeRewardDto, toWelcomeRewardSummary } from "@/lib/welcomeRewardDto";

function menuRow(id: string, isAvailable: boolean, unitPriceVnd: number) {
  return {
    id, name: `Menu ${id}`, category: "extras", is_available: isAvailable, unit_price_vnd: unitPriceVnd,
    matcha_powder_id: null, default_powder_id: null, default_base_liquid_id: null, custom_powder_grams: null,
    sizes: [], fusionAllowedPowders: [], allowedBaseLiquids: [],
  };
}

function projectionDb() {
  const menus = [menuRow("menu-on", true, 20_000), menuRow("menu-off", false, 20_000),
    menuRow("bundle-qualifier", true, 30_000), menuRow("bundle-reward", true, 45_000)];
  return {
    menuItem: { findMany: vi.fn().mockResolvedValue(menus) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue([]) },
    milkType: { findMany: vi.fn().mockResolvedValue([]) },
    addonOption: { findMany: vi.fn().mockResolvedValue([]) },
    defaultSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    powderSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    menuItemSize: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function ownedVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: "internal-voucher", user_id: "internal-user", package_id: "internal-package", qr_token: "public-token",
    voucher_type: "ITEM", issued_via: "GACHA_REWARD", discount_type: null, discount_value: null,
    product_discount_mode: null, menu_item_id: "menu-on", eligible_sizes: [], reference_size: null, size: null,
    matcha_powder_id: null, milk_type_id: null, included_addon_option_ids: [], addon_option_id: null,
    covered_price_vnd: null, covered_delivery_fee_vnd: null, min_order_vnd: null, max_discount_vnd: null,
    status: "ACTIVE", used_channel: null, expires_at: null, redeemed_at: null, created_at: new Date("2026-01-01"),
    package: { name: "Quà", description: null, points_cost: 0, acquisition_mode: "NONE", ends_at: null, bundleRule: null },
    menuItem: { name: "Bánh", is_available: true }, menuItemScopes: [], addonOptionScopes: [],
    addonOption: null, staff: null, pointsLogs: [], ...overrides,
  };
}

function expectedPublicItemVoucher(input: {
  menuItemId: string;
  status: "ACTIVE" | "EXPIRED";
  expiresAt: string | null;
  availability: { status: "USABLE" | "TARGET_UNAVAILABLE"; can_apply: boolean; can_refund: false; refund_points: 0 };
  eligibleMenuItems: Array<{
    menu_item_id: string; name: string; category: string; is_available: boolean; is_seasonal: boolean;
    size: null; matcha_powder_id: null; milk_type_id: null; covered_price_vnd: null;
  }>;
}) {
  return {
    package_id: "internal-package",
    qr_token: "public-token",
    voucher_type: "ITEM",
    issued_via: "GACHA_REWARD",
    discount_type: null,
    discount_value: null,
    product_discount_mode: null,
    menu_item_id: input.menuItemId,
    eligible_sizes: [],
    reference_size: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    max_discount_vnd: null,
    status: input.status,
    used_channel: null,
    expires_at: input.expiresAt,
    redeemed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    package: {
      name: "Quà", description: null, points_cost: 0, acquisition_mode: "NONE", ends_at: null, bundleRule: null,
    },
    menuItem: { name: "Bánh", is_available: true },
    eligible_menu_items: input.eligibleMenuItems,
    eligible_addon_options: [],
    addonOption: null,
    staff: null,
    availability: input.availability,
  };
}

describe("DTO công khai của welcome reward", () => {
  it("chỉ query các package fields thuộc canonical public voucher contract", () => {
    const selection = WELCOME_REWARD_INCLUDE.outcome.include.voucher.include.package.select;
    expect(Object.keys(selection).sort()).toEqual([
      "acquisition_mode", "bundleRule", "description", "ends_at", "name", "points_cost",
    ]);
    for (const internal of ["id", "quantity", "max_per_user", "visibility", "is_active", "created_at", "updated_at"]) {
      expect(selection).not.toHaveProperty(internal);
    }
  });

  it("trả box theo sort_order và chuyển Decimal anchor thành number", async () => {
    const reward = {
      id: "reward", mode: "GACHA", outcome: null,
      campaign: {
        id: "campaign", name: "Hộp cá", status: "ACTIVE", poolItems: [],
        boxes: [{
          id: "box", name: "Cá xanh", closed_image_url: "/closed.png", open_image_url: "/open.png",
          mouth_anchor_x: { valueOf: () => 0.25 }, mouth_anchor_y: { valueOf: () => 0.75 }, sort_order: 1,
        }],
      },
    };
    expect(await toWelcomeRewardDto(projectionDb() as never, reward as never)).toEqual({
      id: "reward", mode: "GACHA", status: "PENDING", can_open: true, unavailable_reason: null,
      campaign: {
        id: "campaign", name: "Hộp cá", status: "ACTIVE",
        boxes: [{ id: "box", name: "Cá xanh", closed_image_url: "/closed.png", open_image_url: "/open.png", mouth_anchor_x: 0.25, mouth_anchor_y: 0.75, sort_order: 1 }],
      },
      outcome: null,
    });
  });

  it("tóm tắt outcome POINTS hoàn tất mà không lộ identity nội bộ", async () => {
    const reward = { id: "reward", mode: "POINTS", campaign: null, outcome: { kind: "POINTS" } };
    expect(toWelcomeRewardSummary(reward as never)).toEqual({
      id: "reward", mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS",
    });
    const dto = await toWelcomeRewardDto(projectionDb() as never, reward as never);
    expect(dto.outcome).toEqual({ kind: "POINTS", points: 5 });
    expect(dto).not.toHaveProperty("user_id");
  });

  it("cho phép mở entitlement ENDED để nhận fallback điểm", async () => {
    const reward = {
      id: "reward", mode: "GACHA", outcome: null,
      campaign: { id: "campaign", name: "Đã kết thúc", status: "ENDED", poolItems: [], boxes: [] },
    };
    await expect(toWelcomeRewardDto(projectionDb() as never, reward as never)).resolves.toMatchObject({ can_open: true, unavailable_reason: null });
  });

  it.each([
    {
      name: "dùng được", menu_item_id: "menu-on", status: "ACTIVE", expires_at: null,
      menuItemScopes: [{ menu_item_id: "menu-on", size: null, matcha_powder_id: null, milk_type_id: null,
        covered_price_vnd: null, menuItem: { name: "Phạm vi còn bán", category: "extras", is_available: true, is_seasonal: false } }],
      expectedVoucher: expectedPublicItemVoucher({
        menuItemId: "menu-on",
        status: "ACTIVE", expiresAt: null,
        availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
        eligibleMenuItems: [{ menu_item_id: "menu-on", name: "Phạm vi còn bán", category: "extras",
          is_available: true, is_seasonal: false, size: null, matcha_powder_id: null,
          milk_type_id: null, covered_price_vnd: null }],
      }),
    },
    {
      name: "target unavailable", menu_item_id: "menu-off", status: "ACTIVE", expires_at: null,
      menuItemScopes: [{ menu_item_id: "menu-off", size: null, matcha_powder_id: null, milk_type_id: null,
        covered_price_vnd: null, menuItem: { name: "Phạm vi đã nghỉ", category: "extras", is_available: false, is_seasonal: true } }],
      expectedVoucher: expectedPublicItemVoucher({
        menuItemId: "menu-off",
        status: "ACTIVE", expiresAt: null,
        availability: { status: "TARGET_UNAVAILABLE", can_apply: false, can_refund: false, refund_points: 0 },
        eligibleMenuItems: [],
      }),
    },
    {
      name: "hết hạn lifecycle", menu_item_id: "menu-on", status: "ACTIVE", expires_at: new Date("2026-01-01"),
      menuItemScopes: [{ menu_item_id: "menu-on", size: null, matcha_powder_id: null, milk_type_id: null,
        covered_price_vnd: null, menuItem: { name: "Phạm vi còn bán", category: "extras", is_available: true, is_seasonal: false } }],
      expectedVoucher: expectedPublicItemVoucher({
        menuItemId: "menu-on",
        status: "EXPIRED", expiresAt: "2026-01-01T00:00:00.000Z",
        availability: { status: "USABLE", can_apply: false, can_refund: false, refund_points: 0 },
        eligibleMenuItems: [{ menu_item_id: "menu-on", name: "Phạm vi còn bán", category: "extras",
          is_available: true, is_seasonal: false, size: null, matcha_powder_id: null,
          milk_type_id: null, covered_price_vnd: null }],
      }),
    },
  ])("project voucher $name qua availability thật và effective expiry", async ({ menu_item_id, status, expires_at, menuItemScopes, expectedVoucher }) => {
    const voucher = ownedVoucher({ menu_item_id, status, expires_at, menuItemScopes });
    const reward = { id: "reward", mode: "GACHA", campaign: null, outcome: { kind: "VOUCHER", voucher } };
    const db = projectionDb();
    const dto = await toWelcomeRewardDto(db as never, reward as never, new Date("2026-02-01"));
    expect(dto).toEqual({
      id: "reward", mode: "GACHA", status: "COMPLETED", can_open: false, unavailable_reason: null,
      campaign: null, outcome: { kind: "VOUCHER", voucher: expectedVoucher },
    });
    if (dto.outcome?.kind !== "VOUCHER") throw new Error("Expected voucher outcome");
    expect(dto.outcome.voucher).not.toHaveProperty("id");
    expect(dto.outcome.voucher).not.toHaveProperty("user_id");
    expect(dto.outcome.voucher).not.toHaveProperty("pointsLogs");
  });

  it("tính baseline BUNDLE từ fixture giá độc lập và trả đúng public contract", async () => {
    const bundleRule = {
      buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "ALLOWED_SCOPE",
      benefit_scaling: "PER_APPLICATION", max_applications_order: 1, max_reward_units_order: 1,
      productScopes: [
        { role: "QUALIFIER", menu_item_id: "bundle-qualifier", default_powder_id: null, default_base_liquid_id: null,
          sizes: [], menuItem: { name: "Món mua", category: "extras", is_available: true } },
        { role: "REWARD", menu_item_id: "bundle-reward", default_powder_id: null, default_base_liquid_id: null,
          sizes: [], menuItem: { name: "Món tặng", category: "extras", is_available: true } },
      ],
      addonRewards: [],
    };
    const voucher = ownedVoucher({ voucher_type: "BUNDLE", menu_item_id: null, menuItem: null, package: {
      name: "Combo", description: "Mua một tặng một", points_cost: 0,
      acquisition_mode: "NONE", ends_at: null, bundleRule,
    } });
    const reward = { id: "reward", mode: "GACHA", campaign: null, outcome: { kind: "VOUCHER", voucher } };
    const db = projectionDb();

    const dto = await toWelcomeRewardDto(db as never, reward as never, new Date("2026-02-01"));

    expect(dto).toEqual({
      id: "reward", mode: "GACHA", status: "COMPLETED", can_open: false, unavailable_reason: null,
      campaign: null,
      outcome: { kind: "VOUCHER", voucher: {
        package_id: "internal-package", qr_token: "public-token", voucher_type: "BUNDLE", issued_via: "GACHA_REWARD",
        discount_type: null, discount_value: null, product_discount_mode: null, menu_item_id: null,
        eligible_sizes: [], reference_size: null, size: null, matcha_powder_id: null, milk_type_id: null,
        included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
        covered_delivery_fee_vnd: null, min_order_vnd: null, max_discount_vnd: null, status: "ACTIVE",
        used_channel: null, expires_at: null, redeemed_at: null, created_at: "2026-01-01T00:00:00.000Z",
        package: {
          name: "Combo", description: "Mua một tặng một", points_cost: 0, acquisition_mode: "NONE", ends_at: null,
          bundleRule: {
            buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "ALLOWED_SCOPE",
            benefit_scaling: "PER_APPLICATION", max_applications_per_order: 1, max_reward_units_per_order: 1,
            qualifier_products: [{
              menu_item_id: "bundle-qualifier",
              menu_item: { name: "Món mua", category: "extras", is_available: true },
              default_powder_id: null, default_base_liquid_id: null, allowed_sizes: [],
            }],
            reward_products: [{
              menu_item_id: "bundle-reward",
              menu_item: { name: "Món tặng", category: "extras", is_available: true },
              default_powder_id: null, default_base_liquid_id: null, allowed_sizes: [], baseline_prices_vnd: {},
              baseline_price_vnd: 45_000,
            }],
            reward_addon_option_ids: [],
          },
        },
        menuItem: null, eligible_menu_items: [], eligible_addon_options: [], addonOption: null, staff: null,
        availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
      } },
    });
    if (dto.outcome?.kind !== "VOUCHER") throw new Error("Expected voucher outcome");
    expect(dto.outcome.voucher).not.toHaveProperty("id");
    expect(dto.outcome.voucher).not.toHaveProperty("user_id");
    expect(dto.outcome.voucher.package.bundleRule).not.toHaveProperty("productScopes");
    expect(db.defaultSizeConfig.findMany).toHaveBeenCalledOnce();
  });
});
