import type {
  BundleMenuConfig,
  BundleProductScopeDraft,
  BundleScopeSize,
} from "@/src/lib/utils/adminVoucherBundle";

export interface BundleScopeCompatibility {
  commonSizes: BundleScopeSize[];
  commonBaseLiquidIds: string[];
  selectedSizes: BundleScopeSize[];
  selectedBaseLiquidId: string | null;
  conflictingMenuItemIds: string[];
}

const DRINK_CATEGORIES = new Set(["latte", "fusion"]);
const SIZE_ORDER: BundleScopeSize[] = ["SMALL", "MEDIUM", "LARGE"];

function intersection(values: string[][]): string[] {
  if (values.length === 0) return [];
  return values[0]!.filter((value) => values.every((group) => group.includes(value)));
}

function menuById(menuItems: BundleMenuConfig[]): ReadonlyMap<string, BundleMenuConfig> {
  return new Map(menuItems.map((menu) => [menu.id, menu]));
}

/** Computes shared drink constraints while preserving incompatible existing selections. */
export function getBundleScopeCompatibility(
  scopes: BundleProductScopeDraft[],
  menuItems: BundleMenuConfig[],
): BundleScopeCompatibility {
  const menus = menuById(menuItems);
  const drinkScopes = scopes.filter((scope) => DRINK_CATEGORIES.has(scope.category));
  const drinkMenus = drinkScopes
    .map((scope) => menus.get(scope.menuItemId))
    .filter((menu): menu is BundleMenuConfig => Boolean(menu));
  const commonSizes = drinkMenus.length > 0
    ? SIZE_ORDER.filter((size) => drinkMenus.every((menu) => menu.availableSizes.includes(size)))
    : [];
  const commonBaseLiquidIds = intersection(drinkMenus.map((menu) => menu.availableBaseLiquidIds));
  const selectedSizes = SIZE_ORDER.filter((size) => drinkScopes.length > 0 && drinkScopes.every((scope) => scope.sizes.includes(size)));
  const selectedMilkIds = intersection(drinkScopes.map((scope) => scope.milkTypeIds));
  const selectedBaseLiquidId = selectedMilkIds.length === 1 ? selectedMilkIds[0]! : null;
  const conflictingMenuItemIds = drinkScopes
    .filter((scope) => scope.sizes.some((size) => !commonSizes.includes(size)) ||
      (scope.milkTypeIds.length > 0 && scope.milkTypeIds.some((id) => !commonBaseLiquidIds.includes(id))))
    .map((scope) => scope.menuItemId);
  return {
    commonSizes,
    commonBaseLiquidIds,
    selectedSizes,
    selectedBaseLiquidId,
    conflictingMenuItemIds: [...new Set(conflictingMenuItemIds)],
  };
}

/** Applies a shared size choice to drinks and leaves extras without drink configuration. */
export function applyCommonBundleSizes(
  scopes: BundleProductScopeDraft[],
  sizes: BundleScopeSize[],
): BundleProductScopeDraft[] {
  return scopes.map((scope) => scope.category === "extras" ? {
    ...scope,
    sizes: [],
    powderIds: [],
    milkTypeIds: [],
    fixedPowderId: null,
  } : { ...scope, sizes: [...sizes] });
}

/** Applies one shared Base Liquid to drinks while preserving all other scope choices. */
export function applyCommonBundleBaseLiquid(
  scopes: BundleProductScopeDraft[],
  baseLiquidId: string,
): BundleProductScopeDraft[] {
  return scopes.map((scope) => scope.category === "extras" ? {
    ...scope,
    sizes: [],
    powderIds: [],
    milkTypeIds: [],
    fixedPowderId: null,
  } : { ...scope, milkTypeIds: [baseLiquidId] });
}
