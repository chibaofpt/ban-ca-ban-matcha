import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { resolveBundleBaselineProducts } from "@/lib/pricing";
import { attachBundleRewardBaselines } from "@/lib/vouchers/voucherBundleDto";

function database() {
  return {
    menuItem: { findMany: vi.fn().mockResolvedValue([{
      id: "fusion", category: "fusion", unit_price_vnd: null,
      default_powder_id: "A", replacement_powder_id: "B", default_base_liquid_id: "liquid-old",
      matcha_powder_id: null, custom_powder_grams: null,
      sizes: [{ size: "MEDIUM", base_price_vnd: 23_000, base_liquid_ml: 200 }],
      allowedBaseLiquids: [{ base_liquid_id: "liquid-effective" }],
    }]) },
    defaultSizeConfig: { findMany: vi.fn().mockResolvedValue([{ size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 }]) },
    powderSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    matchaPowder: { findMany: vi.fn().mockResolvedValue([
      { id: "A", name: "Original", price_per_gram: 6_000, is_available: false, reference_latte_item_id: "latte-A" },
      { id: "B", name: "Replacement", price_per_gram: 7_000, is_available: true, reference_latte_item_id: "latte-B" },
      { id: "C", name: "Upgrade", price_per_gram: 8_000, is_available: true, reference_latte_item_id: "latte-C" },
    ]) },
    milkType: { findMany: vi.fn().mockResolvedValue([
      { id: "liquid-effective", price_per_ml: 20, is_default: false, is_active: true, display_order: 1 },
      { id: "liquid-old", price_per_ml: 10, is_default: false, is_active: false, display_order: 0 },
    ]) },
    menuItemSize: { findMany: vi.fn().mockResolvedValue([
      { menu_item_id: "latte-A", size: "MEDIUM", base_price_vnd: 5_000 },
      { menu_item_id: "latte-B", size: "MEDIUM", base_price_vnd: 8_000 },
      { menu_item_id: "latte-C", size: "MEDIUM", base_price_vnd: 12_000 },
    ]) },
  };
}

describe("Baseline BUNDLE giữ snapshot và mốc bột gốc", () => {
  it("snapshot A vẫn là 50k, B58k và C66k đều tính theo A; không thêm phantom Base Liquid delta", async () => {
    const db = database();
    const result = await resolveBundleBaselineProducts(db as never, ["A", "B", "C"].map((powder) => ({
      menu_item_id: "fusion", allowed_sizes: ["MEDIUM"], default_powder_id: powder,
      default_base_liquid_id: "liquid-effective",
    })));
    expect(result.map((row) => row.baseline_prices_vnd.MEDIUM)).toEqual([50_000, 58_000, 66_000]);
    expect(result.map((row) => row.default_powder_id)).toEqual(["A", "B", "C"]);
    expect(result.map((row) => row.default_base_liquid_id)).toEqual(["liquid-effective", "liquid-effective", "liquid-effective"]);
  });

  it("DTO giữ serving B nhưng baseline vẫn dùng snapshot A 50k", async () => {
    const db = database();
    const snapshot = {
      qr_token: "voucher", package: { bundleRule: {
        buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT" as const,
        reward_mode: "FIXED_CONFIG" as const, benefit_scaling: "PER_BUNDLE" as const,
        max_applications_order: 1, max_reward_units_order: null, addonRewards: [],
        productScopes: [{
          role: "REWARD" as const, menu_item_id: "fusion", default_powder_id: "A",
          default_base_liquid_id: "liquid-effective", sizes: [{ size: "MEDIUM" as const }],
          menuItem: { name: "Fusion", category: "fusion", is_available: true },
        }],
      } },
    };
    const live = structuredClone(snapshot);
    live.package.bundleRule.productScopes[0].default_powder_id = "B";
    const [result] = await attachBundleRewardBaselines(db as never, [live], [snapshot]);
    expect(result.package.bundleRule.productScopes[0]).toMatchObject({
      default_powder_id: "B", baseline_prices_vnd: { MEDIUM: 50_000 },
    });
    expect(snapshot.package.bundleRule.productScopes[0].default_powder_id).toBe("A");
  });
});
