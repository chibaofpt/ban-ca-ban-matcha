import { describe, expect, it } from "vitest";
import { buildBundlePromotionInput } from "@/src/lib/utils/adminPromotion";

const IDS = {
  qualifier: "11111111-1111-4111-8111-111111111111",
  reward: "22222222-2222-4222-8222-222222222222",
  powder: "33333333-3333-4333-8333-333333333333",
  addon: "44444444-4444-4444-8444-444444444444",
};

describe("Payload form promotion BUNDLE", () => {
  it("tạo payload SAME_CONFIG tự cấp với điểm bằng 0", () => {
    const result = buildBundlePromotionInput({
      title: "Mua 1 tặng 1",
      startsAt: "2026-08-11T08:00",
      endsAt: "2026-08-20T20:00",
      acquisitionMode: "AUTO_GRANT",
      pointsCost: 0,
      buyQuantity: 1,
      rewardQuantity: 1,
      rewardKind: "PRODUCT",
      rewardMode: "SAME_CONFIG",
      benefitScaling: "PER_BUNDLE",
      maxApplications: 1,
      qualifierMenuItemId: IDS.qualifier,
      rewardMenuItemId: "",
      rewardSize: "SMALL",
      rewardPowderId: "",
      rewardMilkTypeId: "",
      rewardAddonOptionId: "",
      referencePriceVnd: 0,
    });
    expect(result.package.acquisition_mode).toBe("AUTO_GRANT");
    expect(result.bundle_rule.reward_product_scopes).toEqual([]);
  });

  it("tạo reward scope FIXED_CONFIG đủ size và bột", () => {
    const result = buildBundlePromotionInput({
      title: "Tặng latte cố định",
      startsAt: "2026-08-11T08:00",
      endsAt: "2026-08-20T20:00",
      acquisitionMode: "FREE_CLAIM",
      pointsCost: 0,
      buyQuantity: 2,
      rewardQuantity: 1,
      rewardKind: "PRODUCT",
      rewardMode: "FIXED_CONFIG",
      benefitScaling: "PER_BUNDLE",
      maxApplications: 1,
      qualifierMenuItemId: IDS.qualifier,
      rewardMenuItemId: IDS.reward,
      rewardSize: "LARGE",
      rewardPowderId: IDS.powder,
      rewardMilkTypeId: "",
      rewardAddonOptionId: "",
      referencePriceVnd: 0,
    });
    expect(result.bundle_rule.reward_product_scopes[0]).toEqual({
      menu_item_id: IDS.reward,
      size: "LARGE",
      powder_id: IDS.powder,
      milk_type_id: null,
    });
  });

  it("tạo addon reward scope riêng", () => {
    const result = buildBundlePromotionInput({
      title: "Tặng addon",
      startsAt: "2026-08-11T08:00",
      endsAt: "2026-08-20T20:00",
      acquisitionMode: "POINTS_EXCHANGE",
      pointsCost: 10,
      buyQuantity: 2,
      rewardQuantity: 2,
      rewardKind: "ADDON",
      rewardMode: "ALLOWED_SCOPE",
      benefitScaling: "PER_QUALIFYING_ITEM",
      maxApplications: 1,
      qualifierMenuItemId: IDS.qualifier,
      rewardMenuItemId: "",
      rewardSize: "SMALL",
      rewardPowderId: "",
      rewardMilkTypeId: "",
      rewardAddonOptionId: IDS.addon,
      referencePriceVnd: 0,
    });
    expect(result.bundle_rule.reward_addon_option_ids).toEqual([IDS.addon]);
  });
});
