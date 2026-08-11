import type { CreateBundlePromotionInput } from "@/src/services/adminPromotionService";

export interface BundlePromotionFormState {
  title: string;
  startsAt: string;
  endsAt: string;
  acquisitionMode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  pointsCost: number;
  buyQuantity: number;
  rewardQuantity: number;
  rewardKind: "PRODUCT" | "ADDON";
  rewardMode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefitScaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  maxApplications: number;
  qualifierMenuItemId: string;
  rewardMenuItemId: string;
  rewardSize: "SMALL" | "MEDIUM" | "LARGE";
  rewardPowderId: string;
  rewardMilkTypeId: string;
  rewardAddonOptionId: string;
  referencePriceVnd: number;
}

/** Build the strict admin API payload from the compact campaign form state. */
export function buildBundlePromotionInput(
  state: BundlePromotionFormState,
): CreateBundlePromotionInput {
  const hasProductScope =
    state.rewardKind === "PRODUCT" && state.rewardMode !== "SAME_CONFIG";
  const rewardProductScopes: CreateBundlePromotionInput["bundle_rule"]["reward_product_scopes"] =
    hasProductScope
      ? [
          {
            menu_item_id: state.rewardMenuItemId,
            ...(state.rewardMode === "FIXED_CONFIG"
              ? {
                  size: state.rewardSize,
                  powder_id: state.rewardPowderId,
                  milk_type_id: state.rewardMilkTypeId || null,
                }
              : {
                  reference_price_vnd: state.referencePriceVnd,
                }),
          },
        ]
      : [];
  return {
    title: state.title.trim(),
    starts_at: new Date(state.startsAt).toISOString(),
    ends_at: new Date(state.endsAt).toISOString(),
    max_redemptions: null,
    package: {
      name: state.title.trim(),
      acquisition_mode: state.acquisitionMode,
      points_cost: state.acquisitionMode === "POINTS_EXCHANGE" ? state.pointsCost : 0,
      expires_after_days: 30,
      quantity: null,
      max_per_user: 1,
    },
    bundle_rule: {
      buy_quantity: state.buyQuantity,
      reward_quantity: state.rewardQuantity,
      reward_kind: state.rewardKind,
      reward_mode: state.rewardKind === "ADDON" ? "ALLOWED_SCOPE" : state.rewardMode,
      benefit_scaling: state.benefitScaling,
      max_applications_per_order: state.maxApplications,
      max_reward_units_per_order: null,
      qualifier_scopes: [{ menu_item_id: state.qualifierMenuItemId }],
      reward_product_scopes: rewardProductScopes,
      reward_addon_option_ids:
        state.rewardKind === "ADDON" ? [state.rewardAddonOptionId] : [],
    },
  };
}
