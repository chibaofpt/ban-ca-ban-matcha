import type { CreateVoucherPackageInput, VoucherBundleProductScope } from "@/src/services/adminVoucherService";
import { toExclusiveEndIso } from "@/src/lib/utils/voucherDates";

export type BundleScopeSize = "SMALL" | "MEDIUM" | "LARGE";

export interface BundleProductScopeDraft {
  menuItemId: string;
  category: "latte" | "fusion";
  sizes: BundleScopeSize[];
  powderIds: string[];
  milkTypeIds: string[];
  fixedPowderId: string | null;
  referencePriceVnd: number;
}

export interface BundleMenuConfig {
  id: string;
  name: string;
  category: "latte" | "fusion";
  availableSizes: BundleScopeSize[];
  fixedPowderId: string | null;
  availablePowderIds: string[];
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
type ScopePurpose = "QUALIFIER" | "FIXED_CONFIG" | "ALLOWED_SCOPE";

/** Create an editable product scope with safe defaults from one menu item. */
export function createBundleScopeDraft(menu: BundleMenuConfig): BundleProductScopeDraft {
  return {
    menuItemId: menu.id,
    category: menu.category,
    sizes: [],
    powderIds: [],
    milkTypeIds: [],
    fixedPowderId: menu.fixedPowderId,
    referencePriceVnd: 50_000,
  };
}

function valuesOrNull<T>(values: T[]): Array<T | null> {
  return values.length > 0 ? values : [null];
}

function expandScope(
  draft: BundleProductScopeDraft,
  purpose: ScopePurpose,
): VoucherBundleProductScope[] {
  const sizes = valuesOrNull(draft.sizes);
  const powderIds = purpose === "FIXED_CONFIG" && draft.category === "latte"
    ? [draft.fixedPowderId]
    : valuesOrNull(draft.powderIds);
  const milkIds = draft.category === "latte" ? valuesOrNull(draft.milkTypeIds) : [null];
  const scopes: VoucherBundleProductScope[] = [];
  for (const size of sizes) {
    for (const powderId of powderIds) {
      for (const milkId of milkIds) {
        scopes.push({
          menu_item_id: draft.menuItemId,
          ...(size ? { size } : {}),
          ...(powderId ? { powder_id: powderId } : {}),
          ...(purpose === "FIXED_CONFIG" ? { milk_type_id: milkId } : milkId ? { milk_type_id: milkId } : {}),
          ...(purpose === "ALLOWED_SCOPE" ? { reference_price_vnd: draft.referencePriceVnd } : {}),
        });
      }
    }
  }
  return scopes;
}

/** Builds the unified voucher API payload from per-product BUNDLE scopes. */
export function buildBundleVoucherInput(state: BundleVoucherFormState): BundleInput {
  const productRewards = state.rewardKind === "PRODUCT" && state.rewardMode !== "SAME_CONFIG"
    ? state.rewardProductScopes.flatMap((scope) => expandScope(
        scope,
        state.rewardMode === "FIXED_CONFIG" ? "FIXED_CONFIG" : "ALLOWED_SCOPE",
      ))
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
      qualifier_scopes: state.qualifierScopes.flatMap((scope) => expandScope(scope, "QUALIFIER")),
      reward_product_scopes: productRewards,
      reward_addon_option_ids: state.rewardKind === "ADDON" ? state.rewardAddonOptionIds : [],
    },
  };
}
