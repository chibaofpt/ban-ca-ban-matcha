import type { CreateVoucherPackageInput } from "@/src/services/adminVoucherService";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export interface BundleVoucherFormState {
  name: string;
  description: string;
  endsAt: string;
  acquisitionMode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  pointsCost: number;
  expiresAfterDays: number | null;
  quantity: number | null;
  maxPerUser: number;
  minOrderVnd: number | null;
  buyQuantity: number;
  rewardQuantity: number;
  rewardKind: "PRODUCT" | "ADDON";
  rewardMode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefitScaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  maxApplications: number;
  qualifierMenuItemIds: string[];
  rewardMenuItemIds: string[];
  rewardSize: "SMALL" | "MEDIUM" | "LARGE";
  rewardPowderId: string;
  rewardMilkTypeId: string;
  rewardAddonOptionIds: string[];
  referencePriceVnd: number;
}

type BundleInput = Extract<CreateVoucherPackageInput, { voucher_type: "BUNDLE" }>;

/** Builds the unified voucher API payload from the BUNDLE wizard state. */
export function buildBundleVoucherInput(state: BundleVoucherFormState): BundleInput {
  const productRewards = state.rewardKind === "PRODUCT" && state.rewardMode !== "SAME_CONFIG"
    ? state.rewardMenuItemIds.map((menuItemId) => ({
        menu_item_id: menuItemId,
        ...(state.rewardMode === "FIXED_CONFIG"
          ? {
              size: state.rewardSize,
              powder_id: state.rewardPowderId,
              milk_type_id: state.rewardMilkTypeId || null,
            }
          : { reference_price_vnd: state.referencePriceVnd }),
      }))
    : [];

  return {
    voucher_type: "BUNDLE",
    name: state.name.trim(),
    description: state.description.trim() || undefined,
    acquisition_mode: state.acquisitionMode,
    points_cost: state.acquisitionMode === "POINTS_EXCHANGE" ? state.pointsCost : 0,
    ends_at: state.endsAt ? toExclusiveEndIso(state.endsAt) : null,
    expires_after_days: state.expiresAfterDays,
    quantity: state.quantity,
    max_per_user: state.maxPerUser,
    min_order_vnd: state.minOrderVnd,
    bundle_rule: {
      buy_quantity: state.buyQuantity,
      reward_quantity: state.rewardQuantity,
      reward_kind: state.rewardKind,
      reward_mode: state.rewardKind === "ADDON" ? "ALLOWED_SCOPE" : state.rewardMode,
      benefit_scaling: state.benefitScaling,
      max_applications_per_order: state.maxApplications,
      max_reward_units_per_order: null,
      qualifier_scopes: state.qualifierMenuItemIds.map((menuItemId) => ({ menu_item_id: menuItemId })),
      reward_product_scopes: productRewards,
      reward_addon_option_ids: state.rewardKind === "ADDON" ? state.rewardAddonOptionIds : [],
    },
  };
}
