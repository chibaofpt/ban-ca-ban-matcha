import { describe, expect, it } from "vitest";
import { buildBundleVoucherInput } from "@/src/lib/utils/adminVoucherBundle";

const IDS = {
  qualifier: "11111111-1111-4111-8111-111111111111",
  reward: "22222222-2222-4222-8222-222222222222",
  powder: "33333333-3333-4333-8333-333333333333",
  addon: "44444444-4444-4444-8444-444444444444",
};

function makeState() {
  return {
    name: "Mua 2 tặng 1",
    description: "",
    endsAt: "2026-08-20",
    acquisitionMode: "AUTO_GRANT" as const,
    pointsCost: 0,
    expiresAfterDays: 30,
    quantity: null,
    maxPerUser: 1,
    minOrderVnd: 100_000,
    buyQuantity: 2,
    rewardQuantity: 1,
    rewardKind: "PRODUCT" as const,
    rewardMode: "SAME_CONFIG" as const,
    benefitScaling: "PER_BUNDLE" as const,
    maxApplications: 1,
    qualifierMenuItemIds: [IDS.qualifier],
    rewardMenuItemIds: [] as string[],
    rewardSize: "SMALL" as const,
    rewardPowderId: "",
    rewardMilkTypeId: "",
    rewardAddonOptionIds: [] as string[],
    referencePriceVnd: 0,
  };
}

describe("Payload form voucher BUNDLE", () => {
  it("không còn starts_at và hỗ trợ nhiều món điều kiện", () => {
    const state = makeState();
    state.qualifierMenuItemIds.push(IDS.reward);
    const result = buildBundleVoucherInput(state);
    expect(result.voucher_type).toBe("BUNDLE");
    expect(result.bundle_rule.qualifier_scopes).toEqual([
      { menu_item_id: IDS.qualifier },
      { menu_item_id: IDS.reward },
    ]);
    expect(result).not.toHaveProperty("starts_at");
    expect(result.ends_at).toBe("2026-08-20T17:00:00.000Z");
  });

  it("tự đưa điểm về 0 khi voucher cấp miễn phí", () => {
    expect(buildBundleVoucherInput(makeState()).points_cost).toBe(0);
  });

  it("tạo nhiều reward scope FIXED_CONFIG đủ cấu hình", () => {
    const state = {
      ...makeState(),
      rewardMode: "FIXED_CONFIG" as const,
      rewardMenuItemIds: [IDS.reward, IDS.qualifier],
      rewardSize: "LARGE" as const,
      rewardPowderId: IDS.powder,
    };
    expect(buildBundleVoucherInput(state).bundle_rule.reward_product_scopes).toEqual([
      { menu_item_id: IDS.reward, size: "LARGE", powder_id: IDS.powder, milk_type_id: null },
      { menu_item_id: IDS.qualifier, size: "LARGE", powder_id: IDS.powder, milk_type_id: null },
    ]);
  });

  it("tạo danh sách addon reward riêng", () => {
    const state = {
      ...makeState(),
      acquisitionMode: "POINTS_EXCHANGE" as const,
      pointsCost: 10,
      rewardKind: "ADDON" as const,
      rewardMode: "ALLOWED_SCOPE" as const,
      rewardAddonOptionIds: [IDS.addon],
    };
    const result = buildBundleVoucherInput(state);
    expect(result.points_cost).toBe(10);
    expect(result.bundle_rule.reward_addon_option_ids).toEqual([IDS.addon]);
    expect(result.bundle_rule.reward_product_scopes).toEqual([]);
  });
});
