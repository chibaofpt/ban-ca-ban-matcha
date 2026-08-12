import type { CreateVoucherPackageInput } from "@/lib/validations/voucherPackage";

type BundleInput = Extract<CreateVoucherPackageInput, { voucher_type: "BUNDLE" }>;

interface BundleReferenceMenu {
  id: string;
  category: string;
  is_available: boolean;
  matcha_powder_id?: string | null;
  default_powder_id?: string | null;
  sizes?: Array<{ size: string; base_price_vnd: number | null }>;
  fusionAllowedPowders?: Array<{ powder_id: string }>;
}

interface BundleReferenceAddon {
  id: string;
  is_active: boolean;
  gram_value: unknown | null;
  group: { is_active: boolean };
}

export interface AdminVoucherBundleTransaction {
  menuItem: { findMany: (args: unknown) => Promise<BundleReferenceMenu[]> };
  addonOption: { findMany: (args: unknown) => Promise<BundleReferenceAddon[]> };
  voucherPackage: { create: (args: unknown) => Promise<unknown> };
}

/** Stable reference error raised while publishing an invalid BUNDLE package. */
export class VoucherBundleReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoucherBundleReferenceError";
  }
}

function validateScopeConfigurations(
  input: BundleInput,
  menus: Map<string, BundleReferenceMenu>,
): void {
  const scopes = [
    ...input.bundle_rule.qualifier_scopes,
    ...input.bundle_rule.reward_product_scopes,
  ];
  for (const scope of scopes) {
    const menu = menus.get(scope.menu_item_id);
    if (!menu?.is_available) throw new VoucherBundleReferenceError("Bundle menu scope is unavailable");
    if (scope.size && !menu.sizes?.some((row) => row.size === scope.size && row.base_price_vnd !== null)) {
      throw new VoucherBundleReferenceError("Bundle scope size is unavailable");
    }
    if (scope.powder_id) {
      const powderAllowed = menu.category === "latte"
        ? menu.matcha_powder_id === scope.powder_id
        : menu.default_powder_id === scope.powder_id ||
          Boolean(menu.fusionAllowedPowders?.some((row) => row.powder_id === scope.powder_id));
      if (!powderAllowed) throw new VoucherBundleReferenceError("Bundle scope powder is unavailable");
    }
    if (scope.milk_type_id && menu.category !== "latte") {
      throw new VoucherBundleReferenceError("Only Latte bundle scopes can lock milk");
    }
  }
}

/** Publish an immutable BUNDLE package and its selected product/addon snapshots atomically. */
export async function createBundleVoucherPackage(
  tx: AdminVoucherBundleTransaction,
  input: BundleInput,
): Promise<unknown> {
  const productScopes = [
    ...input.bundle_rule.qualifier_scopes.map((scope) => ({ ...scope, role: "QUALIFIER" as const })),
    ...input.bundle_rule.reward_product_scopes.map((scope) => ({ ...scope, role: "REWARD" as const })),
  ];
  const menuIds = [...new Set(productScopes.map((scope) => scope.menu_item_id))];
  const menus = await tx.menuItem.findMany({
    where: { id: { in: menuIds }, is_available: true },
    select: {
      id: true,
      category: true,
      is_available: true,
      matcha_powder_id: true,
      default_powder_id: true,
      sizes: { select: { size: true, base_price_vnd: true } },
      fusionAllowedPowders: { select: { powder_id: true } },
    },
  });
  if (menus.length !== menuIds.length) {
    throw new VoucherBundleReferenceError("Bundle menu scope is unavailable");
  }
  validateScopeConfigurations(input, new Map(menus.map((menu) => [menu.id, menu])));

  const addonIds = input.bundle_rule.reward_addon_option_ids;
  if (addonIds.length > 0) {
    const addons = await tx.addonOption.findMany({
      where: { id: { in: addonIds }, is_active: true, group: { is_active: true } },
      select: { id: true, is_active: true, gram_value: true, group: { select: { is_active: true } } },
    });
    if (
      addons.length !== addonIds.length ||
      addons.some((addon) => !addon.is_active || !addon.group.is_active || addon.gram_value !== null)
    ) {
      throw new VoucherBundleReferenceError("Bundle addon reward is unavailable");
    }
  }

  const rule = input.bundle_rule;
  return tx.voucherPackage.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      voucher_type: "BUNDLE",
      acquisition_mode: input.acquisition_mode,
      points_cost: input.points_cost,
      min_order_vnd: input.min_order_vnd ?? null,
      ends_at: input.ends_at ? new Date(input.ends_at) : null,
      expires_after_days: input.expires_after_days ?? null,
      quantity: input.quantity ?? null,
      max_per_user: input.max_per_user,
      included_addon_option_ids: [],
      bundleRule: {
        create: {
          buy_quantity: rule.buy_quantity,
          reward_quantity: rule.reward_quantity,
          reward_kind: rule.reward_kind,
          reward_mode: rule.reward_mode,
          benefit_scaling: rule.benefit_scaling,
          max_applications_order: rule.max_applications_per_order,
          max_reward_units_order: rule.max_reward_units_per_order ?? null,
          productScopes: {
            create: productScopes.map((scope) => ({
              role: scope.role,
              menu_item_id: scope.menu_item_id,
              size: scope.size ?? null,
              matcha_powder_id: scope.powder_id ?? null,
              milk_type_id: scope.milk_type_id ?? null,
              reference_price_vnd: scope.reference_price_vnd ?? null,
            })),
          },
          addonRewards: { create: addonIds.map((addon_option_id) => ({ addon_option_id })) },
        },
      },
    },
    include: { bundleRule: { include: { productScopes: true, addonRewards: true } } },
  });
}
