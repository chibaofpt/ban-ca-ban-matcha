import type { BundleScopeRole, Size } from "@prisma/client";

const SIZE_ORDER: Record<Size, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2 };

interface BundleScopeDtoSource {
  role: BundleScopeRole;
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  sizes: Array<{ size: Size }>;
  menuItem: { name: string; category: string; is_available: boolean };
}

interface BundleAddonDtoSource {
  addon_option_id: string;
  addonOption?: { label: string };
}

export interface BundleRuleDtoSource {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: string;
  reward_mode: string;
  benefit_scaling: string;
  max_applications_order: number;
  max_reward_units_order: number | null;
  productScopes: BundleScopeDtoSource[];
  addonRewards: BundleAddonDtoSource[];
}

function mapProduct(scope: BundleScopeDtoSource) {
  return {
    menu_item_id: scope.menu_item_id,
    menu_item: {
      name: scope.menuItem.name,
      category: scope.menuItem.category,
      is_available: scope.menuItem.is_available,
    },
    default_powder_id: scope.default_powder_id,
    default_base_liquid_id: scope.default_base_liquid_id,
    allowed_sizes: scope.sizes.map((row) => row.size).sort((a, b) => SIZE_ORDER[a] - SIZE_ORDER[b]),
  };
}

/** Convert the internal normalized BUNDLE rule into its grouped public API contract. */
export function toBundleRuleDto(rule: BundleRuleDtoSource) {
  return {
    buy_quantity: rule.buy_quantity,
    reward_quantity: rule.reward_quantity,
    reward_kind: rule.reward_kind,
    reward_mode: rule.reward_mode,
    benefit_scaling: rule.benefit_scaling,
    max_applications_per_order: rule.max_applications_order,
    max_reward_units_per_order: rule.max_reward_units_order,
    qualifier_products: rule.productScopes.filter((scope) => scope.role === "QUALIFIER").map(mapProduct),
    reward_products: rule.productScopes.filter((scope) => scope.role === "REWARD").map(mapProduct),
    reward_addon_option_ids: rule.addonRewards.map((reward) => reward.addon_option_id),
  };
}

/** Replace a package's internal BUNDLE relations with the stable grouped DTO. */
export function toVoucherPackageBundleDto<T extends { bundleRule?: BundleRuleDtoSource | null }>(pkg: T) {
  return { ...pkg, bundleRule: pkg.bundleRule ? toBundleRuleDto(pkg.bundleRule) : pkg.bundleRule ?? null };
}
