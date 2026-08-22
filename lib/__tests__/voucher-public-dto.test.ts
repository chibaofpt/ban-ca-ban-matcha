import { describe, expect, it } from "vitest";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";

describe("Voucher public DTO", () => {
  it("chỉ xuất qr_token và bỏ toàn bộ internal identity", () => {
    const dto = toPublicVoucherDto({
      id: "internal-voucher-id",
      user_id: "internal-user-id",
      package_id: "internal-package-id",
      qr_token: "public-voucher-token",
      voucher_type: "DISCOUNT",
      discount_type: "FIXED",
      discount_value: 10_000,
      menu_item_id: null,
      size: null,
      matcha_powder_id: null,
      milk_type_id: null,
      included_addon_option_ids: [],
      addon_option_id: null,
      covered_price_vnd: null,
      covered_delivery_fee_vnd: null,
      min_order_vnd: null,
      status: "ACTIVE",
      used_channel: null,
      expires_at: null,
      redeemed_at: null,
      redeemed_by: "internal-staff-id",
      created_at: new Date("2026-01-01T00:00:00Z"),
      package: { name: "Giảm 10k", description: null, points_cost: 10 },
      menuItem: null,
      addonOption: null,
      staff: { name: "Nhân viên", role: "STAFF" },
    });

    expect(dto.qr_token).toBe("public-voucher-token");
    expect(dto).not.toHaveProperty("id");
    expect(dto).not.toHaveProperty("user_id");
    expect(dto).not.toHaveProperty("package_id");
    expect(dto).not.toHaveProperty("redeemed_by");
  });

  it("chỉ trả baseline động của phần quà BUNDLE, không trả identity nội bộ", () => {
    const dto = toPublicVoucherDto({
      qr_token: "bundle-public-token",
      voucher_type: "BUNDLE",
      discount_type: null,
      discount_value: null,
      menu_item_id: null,
      size: null,
      matcha_powder_id: null,
      milk_type_id: null,
      included_addon_option_ids: [],
      addon_option_id: null,
      covered_price_vnd: null,
      covered_delivery_fee_vnd: null,
      min_order_vnd: null,
      status: "ACTIVE",
      used_channel: null,
      expires_at: null,
      redeemed_at: null,
      created_at: new Date("2026-01-01T00:00:00Z"),
      package: {
        name: "Mua 1 tặng 1",
        description: null,
        points_cost: 0,
        bundleRule: {
          buy_quantity: 1,
          reward_quantity: 1,
          reward_kind: "PRODUCT",
          reward_mode: "FIXED_CONFIG",
          benefit_scaling: "PER_BUNDLE",
          max_applications_order: 1,
          max_reward_units_order: null,
          addonRewards: [],
          productScopes: [{
            role: "REWARD",
            menu_item_id: "public-menu-token",
            default_powder_id: "internal-powder-id",
            default_base_liquid_id: "internal-liquid-id",
            baseline_prices_vnd: { SMALL: 45_000 },
            sizes: [{ size: "SMALL" }],
            menuItem: { name: "Matcha", category: "latte", is_available: true },
          }],
        },
      },
      menuItem: null,
      addonOption: null,
      staff: null,
    } as never);

    const bundleRule = dto.package.bundleRule;
    if (!bundleRule || !("reward_products" in bundleRule)) {
      throw new Error("Expected grouped public BUNDLE rule DTO");
    }
    const reward = bundleRule.reward_products[0];
    expect(reward).toMatchObject({
      menu_item_id: "public-menu-token",
      baseline_prices_vnd: { SMALL: 45_000 },
    });
    expect(reward).not.toHaveProperty("id");
  });
});
