import { describe, expect, it, vi } from "vitest";

const { resolveBundleBaselineProducts } = vi.hoisted(() => ({
  resolveBundleBaselineProducts: vi.fn(),
}));

vi.mock("@/lib/pricing", () => ({ resolveBundleBaselineProducts }));

import { attachBundleRewardBaselines } from "@/lib/voucherBundleDto";
import type { BundleRuleDtoSource } from "@/lib/voucherBundleDto";

function voucher(token: string, status: "ACTIVE" | "EXPIRED") {
  return {
    qr_token: token,
    status,
    package: {
      bundleRule: {
        buy_quantity: 1,
        reward_quantity: 1,
        reward_kind: "PRODUCT",
        reward_mode: "FIXED_CONFIG",
        benefit_scaling: "PER_BUNDLE",
        max_applications_order: 1,
        max_reward_units_order: null,
        productScopes: [
          { role: "QUALIFIER", menu_item_id: "qualifier", default_powder_id: null, default_base_liquid_id: null, sizes: [], menuItem: { name: "Q", category: "latte", is_available: true } },
          { role: "REWARD", menu_item_id: `reward-${token}`, default_powder_id: "powder", default_base_liquid_id: "liquid", sizes: [{ size: "MEDIUM" as const }], menuItem: { name: "R", category: "latte", is_available: status === "ACTIVE" } },
        ],
        addonRewards: [],
      },
    },
  } satisfies { qr_token: string; status: "ACTIVE" | "EXPIRED"; package: { bundleRule: BundleRuleDtoSource } };
}

describe("BUNDLE DTO baseline cho wallet routes", () => {
  it("batch resolve reward của voucher active lẫn inactive và giữ snapshot trên DTO", async () => {
    resolveBundleBaselineProducts.mockResolvedValueOnce([
      { menu_item_id: "reward-active", allowed_sizes: ["MEDIUM"], default_powder_id: "powder", default_base_liquid_id: "liquid", baseline_prices_vnd: { MEDIUM: 55_000 } },
      { menu_item_id: "reward-inactive", allowed_sizes: ["MEDIUM"], default_powder_id: "powder", default_base_liquid_id: "liquid", baseline_prices_vnd: { MEDIUM: 56_000 } },
    ]);

    const result = await attachBundleRewardBaselines({} as never, [voucher("active", "ACTIVE"), voucher("inactive", "EXPIRED")]);

    expect(resolveBundleBaselineProducts).toHaveBeenCalledTimes(1);
    expect(resolveBundleBaselineProducts).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([
      expect.objectContaining({ menu_item_id: "reward-active" }),
      expect.objectContaining({ menu_item_id: "reward-inactive" }),
    ]));
    expect(result[1]?.package.bundleRule?.productScopes[1]).toMatchObject({
      baseline_prices_vnd: { MEDIUM: 56_000 },
    });
  });
});
