import { describe, expect, it, vi } from "vitest";
import {
  attachOwnedVoucherAvailability,
  loadVoucherAvailabilityCatalog,
  resolveBundleRuleAvailability,
  type VoucherAvailabilityCatalog,
  type VoucherBundleRuleSource,
} from "@/lib/voucherAvailability";
import { resolveDefaultBaseLiquidId, resolveFusionDefaultPowderId } from "@/src/utils/menuConfiguration";

const catalog: VoucherAvailabilityCatalog = {
  powders: [
    { id: "cheap", name: "Khác", price_per_gram: 100, is_available: true },
    { id: "hana", name: "Hana", price_per_gram: 300, is_available: true },
    { id: "removed", name: "Removed elsewhere", price_per_gram: 350, is_available: true },
    { id: "meyumi", name: "Meyumi", price_per_gram: 400, is_available: false },
  ],
  baseLiquids: [
    { id: "inactive-liquid", is_active: false, is_default: false, display_order: 0 },
    { id: "liquid-late", is_active: true, is_default: false, display_order: 2 },
    { id: "liquid-first", is_active: true, is_default: true, display_order: 1 },
  ],
  menuItems: [
    {
      id: "latte", category: "latte", name: "Latte", is_available: true,
      unit_price_vnd: null, matcha_powder_id: "meyumi", default_powder_id: null,
      default_base_liquid_id: null, allowed_powder_ids: [], allowed_base_liquid_ids: ["liquid-late"],
      sizes: [{ size: "SMALL", base_price_vnd: 40_000 }],
    },
    {
      id: "fusion", category: "fusion", name: "Fusion", is_available: true,
      unit_price_vnd: null, matcha_powder_id: null, default_powder_id: "hana", allowed_powder_ids: ["cheap"],
      default_base_liquid_id: "inactive-liquid", allowed_base_liquid_ids: ["liquid-late", "liquid-first"],
      sizes: [{ size: "SMALL", base_price_vnd: 45_000 }, { size: "LARGE", base_price_vnd: null }],
    },
    {
      id: "extra", category: "extras", name: "Bánh", is_available: true,
      unit_price_vnd: 20_000, matcha_powder_id: null, default_powder_id: null,
      default_base_liquid_id: null, allowed_powder_ids: [], allowed_base_liquid_ids: [], sizes: [],
    },
  ],
  addonOptions: [
    { id: "addon-ok", is_active: true, gram_value: null, group_is_active: true },
    { id: "addon-gram", is_active: true, gram_value: 1, group_is_active: true },
  ],
};

function rule(overrides: Partial<VoucherBundleRuleSource> = {}): VoucherBundleRuleSource {
  return {
    reward_kind: "PRODUCT",
    reward_mode: "ALLOWED_SCOPE",
    productScopes: [
      { role: "QUALIFIER", menu_item_id: "fusion", default_powder_id: "meyumi", default_base_liquid_id: "inactive-liquid", sizes: [{ size: "SMALL" }, { size: "LARGE" }] },
      { role: "REWARD", menu_item_id: "extra", default_powder_id: null, default_base_liquid_id: null, sizes: [] },
    ],
    addonRewards: [],
    ...overrides,
  };
}

describe("Cấu hình menu dùng chung cho voucher", () => {
  it("Fusion fallback theo tên ưu tiên rồi mới đến bột rẻ nhất và ID", () => {
    expect(resolveFusionDefaultPowderId("meyumi", catalog.powders)).toBe("hana");
    const withoutPriority = catalog.powders.filter((powder) => powder.name !== "Hana");
    expect(resolveFusionDefaultPowderId(null, withoutPriority)).toBe("cheap");
  });

  it("Base Liquid fallback trong allow-list theo display_order", () => {
    expect(resolveDefaultBaseLiquidId("inactive-liquid", ["liquid-late", "liquid-first"], catalog.baseLiquids)).toBe("liquid-first");
  });
});

describe("Live eligibility của BUNDLE", () => {
  it("không swap bột Latte khi fixed powder inactive", () => {
    const result = resolveBundleRuleAvailability(rule({
      productScopes: [
        { role: "QUALIFIER", menu_item_id: "latte", default_powder_id: "hana", default_base_liquid_id: "liquid-first", sizes: [{ size: "SMALL" }] },
        { role: "REWARD", menu_item_id: "extra", default_powder_id: null, default_base_liquid_id: null, sizes: [] },
      ],
    }), catalog);
    expect(result.availability.status).toBe("NO_ACTIVE_CONFIGURATION");
    expect(result.rule.productScopes).toHaveLength(1);
  });

  it("lọc size không còn giá và trả effective Fusion configuration", () => {
    const result = resolveBundleRuleAvailability(rule(), catalog);
    const qualifier = result.rule.productScopes.find((scope) => scope.role === "QUALIFIER");
    expect(result.availability).toMatchObject({ status: "USABLE", can_apply: true });
    expect(qualifier).toMatchObject({
      default_powder_id: "hana",
      default_base_liquid_id: "liquid-first",
      sizes: [{ size: "SMALL" }],
    });
  });

  it("loại addon inactive hoặc dynamic gram và báo không còn reward", () => {
    const result = resolveBundleRuleAvailability(rule({
      reward_kind: "ADDON",
      productScopes: rule().productScopes.filter((scope) => scope.role === "QUALIFIER"),
      addonRewards: [{ addon_option_id: "addon-gram" }],
    }), catalog);
    expect(result.availability).toMatchObject({ status: "NO_ACTIVE_REWARD", can_apply: false });
    expect(result.rule.addonRewards).toEqual([]);
  });

  it("SAME_CONFIG dùng qualifier đã lọc làm reward pool", () => {
    const result = resolveBundleRuleAvailability(rule({
      reward_mode: "SAME_CONFIG",
      productScopes: rule().productScopes.filter((scope) => scope.role === "QUALIFIER"),
    }), catalog);
    expect(result.availability.status).toBe("USABLE");
  });
});

describe("Availability của voucher đã sở hữu", () => {
  it("PRODUCT_DISCOUNT không coi Latte có fixed powder inactive là target usable", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "bad-latte", qr_token: "bad-latte-token", voucher_type: "PRODUCT_DISCOUNT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "latte", menuItemScopes: [{ menu_item_id: "latte" }],
      size: null, eligible_sizes: ["SMALL"], reference_size: null, product_discount_mode: "FIXED_AMOUNT",
      matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
      pointsLogs: [{ delta: -7, reason: "voucher_purchase" }], package: { bundleRule: null },
    }], catalog);
    expect(voucher?.availability).toMatchObject({ can_apply: false, can_refund: true });
  });

  it("PRODUCT_DISCOUNT không coi Fusion thiếu Base Liquid orderable là target usable", () => {
    const invalidCatalog: VoucherAvailabilityCatalog = {
      ...catalog,
      menuItems: catalog.menuItems.map((item) => item.id === "fusion"
        ? { ...item, default_base_liquid_id: "inactive-liquid", allowed_base_liquid_ids: [] }
        : item),
    };
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "bad-liquid", qr_token: "bad-liquid-token", voucher_type: "PRODUCT_DISCOUNT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "fusion", menuItemScopes: [{ menu_item_id: "fusion" }],
      size: null, eligible_sizes: ["SMALL"], reference_size: null, product_discount_mode: "FIXED_AMOUNT",
      matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
      pointsLogs: [{ delta: -7, reason: "voucher_purchase" }], package: { bundleRule: null },
    }], invalidCatalog);
    expect(voucher?.availability).toMatchObject({ can_apply: false, can_refund: true });
  });

  it("PRODUCT_DISCOUNT dùng được khi anchor mất nhưng target scope khác còn active", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "multi", qr_token: "multi-token", voucher_type: "PRODUCT_DISCOUNT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "missing", menuItemScopes: [{ menu_item_id: "missing" }, { menu_item_id: "fusion" }],
      size: null, eligible_sizes: ["SMALL"], reference_size: null, product_discount_mode: "FIXED_AMOUNT",
      matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
      pointsLogs: [{ delta: -7, reason: "voucher_purchase" }], package: { bundleRule: null },
    }], catalog);
    expect(voucher?.availability).toMatchObject({ can_apply: true, can_refund: false });
    expect(voucher?.menuItemScopes).toEqual([{ menu_item_id: "fusion" }]);
  });

  it("chỉ trả PRODUCT target còn cấu hình dùng được cho client chọn", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "multi-product", qr_token: "multi-product-token", voucher_type: "PRODUCT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "latte", size: "SMALL", eligible_sizes: [], reference_size: null,
      product_discount_mode: null, matcha_powder_id: null, milk_type_id: "liquid-first",
      addon_option_id: null, pointsLogs: [], package: { bundleRule: null },
      menuItemScopes: [
        { menu_item_id: "latte", size: "SMALL", milk_type_id: "liquid-first", covered_price_vnd: 40_000 },
        { menu_item_id: "fusion", size: "SMALL", milk_type_id: "liquid-first", covered_price_vnd: 45_000 },
      ],
    }], catalog);

    expect(voucher?.availability.can_apply).toBe(true);
    expect(voucher?.menuItemScopes).toEqual([
      {
        menu_item_id: "fusion",
        size: "SMALL",
        matcha_powder_id: "hana",
        milk_type_id: "liquid-first",
        covered_price_vnd: 45_000,
      },
    ]);
  });

  it("PRODUCT normalized target fallback sang size live khi snapshot size đã nghỉ", () => {
    const productCatalog: VoucherAvailabilityCatalog = {
      ...catalog,
      menuItems: catalog.menuItems.map((item) => item.id === "fusion" ? {
        ...item,
        sizes: [{ size: "MEDIUM", base_price_vnd: 50_000 }],
      } : item),
    };
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "multi-product-size", qr_token: "multi-product-size-token", voucher_type: "PRODUCT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "fusion", size: "SMALL", eligible_sizes: [], reference_size: null,
      product_discount_mode: null, matcha_powder_id: "meyumi", milk_type_id: "inactive-liquid",
      addon_option_id: null, pointsLogs: [{ delta: -9, reason: "voucher_purchase" }], package: { bundleRule: null },
      menuItemScopes: [{
        menu_item_id: "fusion", size: "SMALL", matcha_powder_id: "meyumi",
        milk_type_id: "inactive-liquid", covered_price_vnd: 45_000,
      }],
    }], productCatalog);

    expect(voucher?.availability).toMatchObject({ status: "USABLE", can_apply: true, can_refund: false });
    expect(voucher?.menuItemScopes).toEqual([{
      menu_item_id: "fusion",
      size: "MEDIUM",
      matcha_powder_id: "hana",
      milk_type_id: "liquid-first",
      covered_price_vnd: 45_000,
    }]);
  });

  it("PRODUCT Fusion thay snapshot powder đã bị gỡ bằng default hiện tại và giữ nguyên credit", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "fusion-powder-fallback", qr_token: "fusion-powder-fallback-token", voucher_type: "PRODUCT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "fusion", size: "SMALL", eligible_sizes: [], reference_size: null,
      product_discount_mode: null, matcha_powder_id: "removed", milk_type_id: "liquid-first",
      addon_option_id: null, pointsLogs: [], package: { bundleRule: null },
      menuItemScopes: [{
        menu_item_id: "fusion", size: "SMALL", matcha_powder_id: "removed",
        milk_type_id: "liquid-first", covered_price_vnd: 45_000,
      }],
    }], catalog);

    expect(voucher?.menuItemScopes).toEqual([{
      menu_item_id: "fusion",
      size: "SMALL",
      matcha_powder_id: "hana",
      milk_type_id: "liquid-first",
      covered_price_vnd: 45_000,
    }]);
  });

  it("lọc ADDON target dynamic gram trước khi trả cho client", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "multi-addon", qr_token: "multi-addon-token", voucher_type: "ADDON",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: null, size: null, eligible_sizes: [], reference_size: null,
      product_discount_mode: null, matcha_powder_id: null, milk_type_id: null,
      addon_option_id: "addon-gram", pointsLogs: [], package: { bundleRule: null },
      addonOptionScopes: [{ addon_option_id: "addon-gram" }, { addon_option_id: "addon-ok" }],
    }], catalog);

    expect(voucher?.availability.can_apply).toBe(true);
    expect(voucher?.addonOptionScopes).toEqual([{ addon_option_id: "addon-ok" }]);
  });

  it("PRODUCT_DISCOUNT chỉ được hoàn khi toàn bộ target scope mất", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "multi-gone", qr_token: "multi-gone-token", voucher_type: "PRODUCT_DISCOUNT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "missing", menuItemScopes: [{ menu_item_id: "missing" }, { menu_item_id: "also-missing" }],
      size: null, eligible_sizes: ["SMALL"], reference_size: null, product_discount_mode: "FIXED_AMOUNT",
      matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
      pointsLogs: [{ delta: -7, reason: "voucher_purchase" }], package: { bundleRule: null },
    }], catalog);
    expect(voucher?.availability).toMatchObject({ can_apply: false, can_refund: true, refund_points: 7 });
  });

  it("giữ voucher unusable trong ví và hoàn đúng purchase log", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "voucher-1", qr_token: "public-token", voucher_type: "PRODUCT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "missing", size: "SMALL", matcha_powder_id: null,
      milk_type_id: null, addon_option_id: null,
      pointsLogs: [{ delta: -7, reason: "voucher_purchase" }],
      package: { bundleRule: null },
    }], catalog);
    expect(voucher?.availability).toEqual({
      status: "TARGET_UNAVAILABLE", can_apply: false, can_refund: true, refund_points: 7,
    });
  });

  it("voucher free unusable không được hoàn điểm", () => {
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "voucher-2", qr_token: "free-token", voucher_type: "ITEM",
      issued_via: "FREE_CLAIM", status: "ACTIVE", expires_at: null,
      menu_item_id: "missing", size: null, matcha_powder_id: null,
      milk_type_id: null, addon_option_id: null, pointsLogs: [],
      package: { bundleRule: null },
    }], catalog);
    expect(voucher?.availability).toMatchObject({ can_apply: false, can_refund: false, refund_points: 0 });
  });

  it("PRODUCT bỏ qua snapshot size đã nghỉ nếu món còn size hiện tại orderable", () => {
    const productCatalog: VoucherAvailabilityCatalog = {
      ...catalog,
      menuItems: catalog.menuItems.map((item) => item.id === "fusion" ? {
        ...item,
        sizes: [{ size: "MEDIUM", base_price_vnd: 50_000 }],
      } : item),
    };
    const [voucher] = attachOwnedVoucherAvailability([{
      id: "voucher-product", qr_token: "product-token", voucher_type: "PRODUCT",
      issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
      menu_item_id: "fusion", size: "SMALL", matcha_powder_id: "retired-snapshot-powder",
      milk_type_id: "retired-snapshot-liquid", addon_option_id: null,
      pointsLogs: [{ delta: -9, reason: "voucher_purchase" }], package: { bundleRule: null },
    }], productCatalog);
    expect(voucher?.availability).toEqual({
      status: "USABLE", can_apply: true, can_refund: false, refund_points: 0,
    });
  });
});

describe("Batch loader của live eligibility", () => {
  it("đọc mỗi catalog đúng một lần thay vì query theo từng voucher", async () => {
    const menuFindMany = vi.fn().mockResolvedValue([]);
    const powderFindMany = vi.fn().mockResolvedValue([]);
    const liquidFindMany = vi.fn().mockResolvedValue([]);
    const addonFindMany = vi.fn().mockResolvedValue([]);
    await loadVoucherAvailabilityCatalog({
      menuItem: { findMany: menuFindMany },
      matchaPowder: { findMany: powderFindMany },
      milkType: { findMany: liquidFindMany },
      addonOption: { findMany: addonFindMany },
    });
    expect([menuFindMany, powderFindMany, liquidFindMany, addonFindMany]
      .every((mock) => mock.mock.calls.length === 1)).toBe(true);
  });
});
