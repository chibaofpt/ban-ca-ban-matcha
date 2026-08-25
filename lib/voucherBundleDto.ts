import type { BundleScopeRole, Size } from "@prisma/client";
import { resolveBundleBaselineProducts } from "@/lib/pricing";

const SIZE_ORDER: Record<Size, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2 };

interface BundleScopeDtoSource {
  role: BundleScopeRole;
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  sizes: Array<{ size: Size }>;
  menuItem: { name: string; category: string; is_available: boolean };
  baseline_prices_vnd?: Partial<Record<Size, number>>;
  baseline_price_vnd?: number;
}

interface BundleAddonDtoSource {
  addon_option_id: string;
  addonOption?: { label: string };
}

export interface BundleRuleDtoSource {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
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
    ...(scope.baseline_prices_vnd ? { baseline_prices_vnd: scope.baseline_prices_vnd } : {}),
    ...(scope.baseline_price_vnd !== undefined ? { baseline_price_vnd: scope.baseline_price_vnd } : {}),
  };
}

type VoucherWithBundleRule = {
  qr_token: string;
  package: { bundleRule?: BundleRuleDtoSource | null };
};

/** Resolve dynamic baseline prices once for every non-SAME_CONFIG BUNDLE reward scope. */
export async function attachBundleRewardBaselines<T extends VoucherWithBundleRule>(
  client: Parameters<typeof resolveBundleBaselineProducts>[0],
  vouchers: T[],
): Promise<T[]> {
  const entries = vouchers.flatMap((voucher) => {
    const rule = voucher.package.bundleRule;
    if (!rule || rule.reward_mode === "SAME_CONFIG") return [];
    return rule.productScopes.flatMap((scope, index) => scope.role === "REWARD" ? [{
      key: `${voucher.qr_token}:${index}`,
      scope,
      input: {
        menu_item_id: scope.menu_item_id,
        allowed_sizes: scope.sizes.map((size) => size.size),
        default_powder_id: scope.default_powder_id,
        default_base_liquid_id: scope.default_base_liquid_id,
      },
    }] : []);
  });
  if (entries.length === 0) return vouchers;
  const resolved = await resolveBundleBaselineProducts(client, entries.map((entry) => entry.input));
  const baselineByKey = new Map(entries.map((entry, index) => [entry.key, resolved[index]! ]));
  return vouchers.map((voucher) => {
    const rule = voucher.package.bundleRule;
    if (!rule || rule.reward_mode === "SAME_CONFIG") return voucher;
    return {
      ...voucher,
      package: {
        ...voucher.package,
        bundleRule: {
          ...rule,
          productScopes: rule.productScopes.map((scope, index) => {
            if (scope.role !== "REWARD") return scope;
            const baseline = baselineByKey.get(`${voucher.qr_token}:${index}`);
            return baseline ? {
              ...scope,
              baseline_prices_vnd: baseline.baseline_prices_vnd,
              ...(baseline.baseline_price_vnd === undefined ? {} : { baseline_price_vnd: baseline.baseline_price_vnd }),
            } : scope;
          }),
        },
      },
    };
  });
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
export function toVoucherPackageBundleDto<T extends {
  bundleRule?: BundleRuleDtoSource | null;
  menuItemScopes?: Array<{ menu_item_id: string; menuItem: { name: string; category: string; is_available: boolean; is_seasonal: boolean } }>;
}>(pkg: T) {
  return {
    ...pkg,
    eligible_menu_items: (pkg.menuItemScopes ?? []).map((scope) => ({
      menu_item_id: scope.menu_item_id,
      name: scope.menuItem.name,
      category: scope.menuItem.category,
      is_available: scope.menuItem.is_available,
      is_seasonal: scope.menuItem.is_seasonal,
    })),
    bundleRule: pkg.bundleRule ? toBundleRuleDto(pkg.bundleRule) : pkg.bundleRule ?? null,
  };
}
