import { describe, expect, it } from "vitest";
import { buildBundleVoucherInput, type BundleVoucherFormState } from "@/src/lib/utils/adminVoucherBundle";

const IDS = {
  latte: "11111111-1111-4111-8111-111111111111",
  fusionA: "22222222-2222-4222-8222-222222222222",
  fusionB: "33333333-3333-4333-8333-333333333333",
  powderA: "44444444-4444-4444-8444-444444444444",
  powderB: "55555555-5555-4555-8555-555555555555",
  powderC: "66666666-6666-4666-8666-666666666666",
  milk: "77777777-7777-4777-8777-777777777777",
  addon: "88888888-8888-4888-8888-888888888888",
};

function scope(overrides: Record<string, unknown> = {}) {
  return {
    menuItemId: IDS.latte,
    category: "latte" as const,
    sizes: [] as Array<"SMALL" | "MEDIUM" | "LARGE">,
    powderIds: [] as string[],
    milkTypeIds: [] as string[],
    fixedPowderId: IDS.powderA,
    referencePriceVnd: 50_000,
    ...overrides,
  };
}

function makeState(): BundleVoucherFormState {
  return {
    name: "Mua 2 tặng 1", description: "", endsAt: "2026-08-20",
    acquisitionMode: "AUTO_GRANT", pointsCost: 0, expiresAfterDays: 30,
    quantity: null, maxPerUser: 1, minOrderVnd: 100_000,
    buyQuantity: 2, rewardQuantity: 1, rewardKind: "PRODUCT",
    rewardMode: "SAME_CONFIG", benefitScaling: "PER_BUNDLE", maxApplications: 1,
    qualifierScopes: [scope()], rewardProductScopes: [], rewardAddonOptionIds: [],
  };
}

describe("Payload form voucher BUNDLE theo từng món", () => {
  it("gộp MEDIUM và LARGE vào một qualifier product", () => {
    const state = makeState();
    state.qualifierScopes = [scope({ sizes: ["MEDIUM", "LARGE"] })];

    expect(buildBundleVoucherInput(state).bundle_rule.qualifier_products).toEqual([{
      menu_item_id: IDS.latte,
      default_powder_id: IDS.powderA,
      default_base_liquid_id: null,
      allowed_sizes: ["MEDIUM", "LARGE"],
    }]);
  });

  it("FIXED_CONFIG Latte tự dùng bột gốc và cấu hình sữa đã chọn", () => {
    const state = makeState();
    state.rewardMode = "FIXED_CONFIG";
    state.rewardProductScopes = [scope({ sizes: ["MEDIUM"], milkTypeIds: [IDS.milk] })];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_products).toEqual([{
      menu_item_id: IDS.latte,
      allowed_sizes: ["MEDIUM"],
      default_powder_id: IDS.powderA,
      default_base_liquid_id: IDS.milk,
    }]);
  });

  it("mỗi Fusion lưu đúng một cấu hình mặc định và nhiều allowed sizes", () => {
    const state = makeState();
    state.rewardMode = "FIXED_CONFIG";
    state.rewardProductScopes = [
      scope({ menuItemId: IDS.fusionA, category: "fusion", fixedPowderId: null, sizes: ["SMALL"], powderIds: [IDS.powderA] }),
      scope({ menuItemId: IDS.fusionB, category: "fusion", fixedPowderId: null, sizes: ["LARGE"], powderIds: [IDS.powderC] }),
    ];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_products).toEqual([
      { menu_item_id: IDS.fusionA, allowed_sizes: ["SMALL"], default_powder_id: IDS.powderA, default_base_liquid_id: null },
      { menu_item_id: IDS.fusionB, allowed_sizes: ["LARGE"], default_powder_id: IDS.powderC, default_base_liquid_id: null },
    ]);
  });

  it("ALLOWED_SCOPE không gửi reference price do server tự resolve", () => {
    const state = makeState();
    state.rewardMode = "ALLOWED_SCOPE";
    state.rewardProductScopes = [scope({
      menuItemId: IDS.fusionA, category: "fusion", fixedPowderId: null,
      sizes: ["MEDIUM"], powderIds: [IDS.powderB], referencePriceVnd: 55_000,
    })];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_products).toEqual([{
      menu_item_id: IDS.fusionA,
      allowed_sizes: ["MEDIUM"],
      default_powder_id: IDS.powderB,
      default_base_liquid_id: null,
    }]);
  });

  it("tạo danh sách addon reward riêng và đưa điểm free về 0", () => {
    const state = makeState();
    state.rewardKind = "ADDON";
    state.rewardAddonOptionIds = [IDS.addon];
    expect(buildBundleVoucherInput(state).points_cost).toBe(0);
    expect(buildBundleVoucherInput(state).bundle_rule.reward_addon_option_ids).toEqual([IDS.addon]);
  });
});
