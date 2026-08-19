import type { CreateVoucherPackageInput, VoucherBundleProductScope } from "@/src/services/adminVoucherService";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export type BundleScopeSize = "SMALL" | "MEDIUM" | "LARGE";

export interface BundleProductScopeDraft {
  menuItemId: string;
  category: "latte" | "fusion" | "extras";
  sizes: BundleScopeSize[];
  powderIds: string[];
  milkTypeIds: string[];
  fixedPowderId: string | null;
}

export interface BundleMenuConfig {
  id: string;
  name: string;
  category: "latte" | "fusion" | "extras";
  availableSizes: BundleScopeSize[];
  fixedPowderId: string | null;
  availablePowderIds: string[];
  availableBaseLiquidIds: string[];
}

export interface BundleVoucherFormState {
  name: string; description: string; endsAt: string;
  acquisitionMode: "POINTS_EXCHANGE" | "FREE_CLAIM" | "AUTO_GRANT";
  pointsCost: number; expiresAfterDays: number | null; quantity: number | null;
  maxPerUser: number; minOrderVnd: number | null; buyQuantity: number;
  rewardQuantity: number; rewardKind: "PRODUCT" | "ADDON";
  rewardMode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefitScaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  maxApplications: number;
  qualifierScopes: BundleProductScopeDraft[];
  rewardProductScopes: BundleProductScopeDraft[];
  rewardAddonOptionIds: string[];
}

type BundleInput = Extract<CreateVoucherPackageInput, { voucher_type: "BUNDLE" }>;
/** Create an editable product scope with safe defaults from one menu item. */
export function createBundleScopeDraft(menu: BundleMenuConfig): BundleProductScopeDraft {
  return {
    menuItemId: menu.id,
    category: menu.category,
    sizes: [],
    powderIds: menu.availablePowderIds.slice(0, 1),
    milkTypeIds: menu.availableBaseLiquidIds.slice(0, 1),
    fixedPowderId: menu.fixedPowderId,
  };
}

function groupedProduct(draft: BundleProductScopeDraft): VoucherBundleProductScope {
  const isExtra = draft.category === "extras";
  return {
    menu_item_id: draft.menuItemId,
    default_powder_id: isExtra ? null : draft.fixedPowderId ?? draft.powderIds[0] ?? null,
    default_base_liquid_id: isExtra ? null : draft.milkTypeIds[0] ?? null,
    allowed_sizes: isExtra ? [] : draft.sizes,
  };
}

/** Builds the unified voucher API payload from per-product BUNDLE scopes. */
export function buildBundleVoucherInput(state: BundleVoucherFormState): BundleInput {
  const productRewards = state.rewardKind === "PRODUCT" && state.rewardMode !== "SAME_CONFIG"
    ? state.rewardProductScopes.map(groupedProduct)
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
      qualifier_products: state.qualifierScopes.map(groupedProduct),
      reward_products: productRewards,
      reward_addon_option_ids: state.rewardKind === "ADDON" ? state.rewardAddonOptionIds : [],
    },
  };
}
