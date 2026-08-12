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
  it("mở rộng size MEDIUM và LARGE thành hai qualifier scope", () => {
    const state = makeState();
    state.qualifierScopes = [scope({ sizes: ["MEDIUM", "LARGE"] })];

    expect(buildBundleVoucherInput(state).bundle_rule.qualifier_scopes).toEqual([
      { menu_item_id: IDS.latte, size: "MEDIUM" },
      { menu_item_id: IDS.latte, size: "LARGE" },
    ]);
  });

  it("FIXED_CONFIG Latte tự dùng bột gốc và cấu hình sữa đã chọn", () => {
    const state = makeState();
    state.rewardMode = "FIXED_CONFIG";
    state.rewardProductScopes = [scope({ sizes: ["MEDIUM"], milkTypeIds: [IDS.milk] })];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_product_scopes).toEqual([{
      menu_item_id: IDS.latte,
      size: "MEDIUM",
      powder_id: IDS.powderA,
      milk_type_id: IDS.milk,
    }]);
  });

  it("mỗi Fusion có range bột riêng và tạo đúng các reward scope", () => {
    const state = makeState();
    state.rewardMode = "FIXED_CONFIG";
    state.rewardProductScopes = [
      scope({ menuItemId: IDS.fusionA, category: "fusion", fixedPowderId: null, sizes: ["SMALL"], powderIds: [IDS.powderA, IDS.powderB] }),
      scope({ menuItemId: IDS.fusionB, category: "fusion", fixedPowderId: null, sizes: ["LARGE"], powderIds: [IDS.powderC] }),
    ];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_product_scopes).toEqual([
      { menu_item_id: IDS.fusionA, size: "SMALL", powder_id: IDS.powderA, milk_type_id: null },
      { menu_item_id: IDS.fusionA, size: "SMALL", powder_id: IDS.powderB, milk_type_id: null },
      { menu_item_id: IDS.fusionB, size: "LARGE", powder_id: IDS.powderC, milk_type_id: null },
    ]);
  });

  it("ALLOWED_SCOPE giữ restriction riêng và hạn mức riêng của từng món", () => {
    const state = makeState();
    state.rewardMode = "ALLOWED_SCOPE";
    state.rewardProductScopes = [scope({
      menuItemId: IDS.fusionA, category: "fusion", fixedPowderId: null,
      sizes: ["MEDIUM"], powderIds: [IDS.powderB], referencePriceVnd: 55_000,
    })];

    expect(buildBundleVoucherInput(state).bundle_rule.reward_product_scopes).toEqual([{
      menu_item_id: IDS.fusionA,
      size: "MEDIUM",
      powder_id: IDS.powderB,
      reference_price_vnd: 55_000,
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
