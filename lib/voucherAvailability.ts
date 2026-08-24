import type { Size } from "@prisma/client";
import { resolveDefaultBaseLiquidId, resolveFusionDefaultPowderId } from "@/src/utils/menuConfiguration";

export type VoucherAvailabilityStatus =
  | "USABLE"
  | "TARGET_UNAVAILABLE"
  | "NO_ACTIVE_QUALIFIER"
  | "NO_ACTIVE_REWARD"
  | "NO_ACTIVE_CONFIGURATION";

export interface VoucherAvailability {
  status: VoucherAvailabilityStatus;
  can_apply: boolean;
  can_refund: boolean;
  refund_points: number;
}

export interface VoucherBundleScopeSource {
  role: "QUALIFIER" | "REWARD";
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  sizes: Array<{ size: Size }>;
}

export interface VoucherBundleRuleSource {
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  productScopes: VoucherBundleScopeSource[];
  addonRewards: Array<{ addon_option_id: string }>;
}

export interface VoucherAvailabilityCatalog {
  powders: Array<{ id: string; name: string; price_per_gram: number; is_available: boolean }>;
  baseLiquids: Array<{ id: string; is_active: boolean; is_default: boolean; display_order: number }>;
  menuItems: Array<{
    id: string;
    name: string;
    category: string;
    is_available: boolean;
    unit_price_vnd: number | null;
    matcha_powder_id: string | null;
    default_powder_id: string | null;
    default_base_liquid_id: string | null;
    allowed_base_liquid_ids: string[];
    sizes: Array<{ size: Size; base_price_vnd: number | null }>;
  }>;
  addonOptions: Array<{
    id: string;
    is_active: boolean;
    gram_value: unknown | null;
    group_is_active: boolean;
  }>;
}

export interface VoucherAvailabilityDatabase {
  menuItem: { findMany: (args: unknown) => Promise<Array<{
    id: string; name: string; category: string; is_available: boolean; unit_price_vnd: number | null;
    matcha_powder_id: string | null; default_powder_id: string | null; default_base_liquid_id: string | null;
    sizes: Array<{ size: Size; base_price_vnd: number | null }>;
    allowedBaseLiquids: Array<{ base_liquid_id: string }>;
  }>> };
  matchaPowder: { findMany: (args: unknown) => Promise<VoucherAvailabilityCatalog["powders"]> };
  milkType: { findMany: (args: unknown) => Promise<VoucherAvailabilityCatalog["baseLiquids"]> };
  addonOption: { findMany: (args: unknown) => Promise<Array<{
    id: string; is_active: boolean; gram_value: unknown | null; group: { is_active: boolean };
  }>> };
}

function unavailable(status: VoucherAvailabilityStatus): VoucherAvailability {
  return { status, can_apply: false, can_refund: false, refund_points: 0 };
}

function filterProductScope(
  scope: VoucherBundleScopeSource,
  catalog: VoucherAvailabilityCatalog,
): { scope: VoucherBundleScopeSource | null; configurationMissing: boolean } {
  const item = catalog.menuItems.find((candidate) => candidate.id === scope.menu_item_id);
  if (!item?.is_available) return { scope: null, configurationMissing: false };
  if (item.category === "extras") {
    return item.unit_price_vnd !== null && item.unit_price_vnd >= 1_000
      ? { scope: { ...scope, default_powder_id: null, default_base_liquid_id: null, sizes: [] }, configurationMissing: false }
      : { scope: null, configurationMissing: false };
  }
  const sizes = scope.sizes.filter((entry) =>
    item.sizes.some((size) => size.size === entry.size && size.base_price_vnd !== null),
  );
  if (sizes.length === 0) return { scope: null, configurationMissing: true };

  let powderId: string | null = null;
  if (item.category === "latte") {
    powderId = item.matcha_powder_id;
    if (!powderId || !catalog.powders.some((powder) => powder.id === powderId && powder.is_available)) {
      return { scope: null, configurationMissing: true };
    }
  } else if (item.category === "fusion") {
    powderId = resolveFusionDefaultPowderId(scope.default_powder_id ?? item.default_powder_id, catalog.powders);
    if (!powderId) return { scope: null, configurationMissing: true };
  } else {
    return { scope: null, configurationMissing: false };
  }

  const globalDefaultId = catalog.baseLiquids.find((liquid) => liquid.is_default && liquid.is_active)?.id ?? null;
  const currentDefaultId = item.category === "latte" ? globalDefaultId : item.default_base_liquid_id;
  const compatibleIds = [...new Set([...(currentDefaultId ? [currentDefaultId] : []), ...item.allowed_base_liquid_ids])];
  const baseLiquidId = resolveDefaultBaseLiquidId(scope.default_base_liquid_id, compatibleIds, catalog.baseLiquids);
  if (!baseLiquidId) return { scope: null, configurationMissing: true };
  return {
    scope: { ...scope, default_powder_id: powderId, default_base_liquid_id: baseLiquidId, sizes },
    configurationMissing: false,
  };
}

/** Filter a BUNDLE rule against live menu configuration and return its stable availability. */
export function resolveBundleRuleAvailability<T extends VoucherBundleRuleSource>(
  rule: T,
  catalog: VoucherAvailabilityCatalog,
): { rule: T; availability: VoucherAvailability } {
  let configurationMissing = false;
  const productScopes = rule.productScopes.flatMap((scope) => {
    const resolved = filterProductScope(scope, catalog);
    configurationMissing ||= resolved.configurationMissing;
    return resolved.scope ? [resolved.scope] : [];
  });
  const addonRewards = rule.addonRewards.filter((reward) => {
    const option = catalog.addonOptions.find((candidate) => candidate.id === reward.addon_option_id);
    return Boolean(option?.is_active && option.group_is_active && option.gram_value === null);
  });
  const qualifierCount = productScopes.filter((scope) => scope.role === "QUALIFIER").length;
  const rewardCount = rule.reward_mode === "SAME_CONFIG"
    ? qualifierCount
    : rule.reward_kind === "PRODUCT"
      ? productScopes.filter((scope) => scope.role === "REWARD").length
      : addonRewards.length;
  const status = qualifierCount === 0
    ? (configurationMissing ? "NO_ACTIVE_CONFIGURATION" : "NO_ACTIVE_QUALIFIER")
    : rewardCount === 0
      ? (configurationMissing && rule.reward_kind === "PRODUCT" ? "NO_ACTIVE_CONFIGURATION" : "NO_ACTIVE_REWARD")
      : "USABLE";
  return {
    rule: { ...rule, productScopes, addonRewards } as T,
    availability: status === "USABLE"
      ? { status, can_apply: true, can_refund: false, refund_points: 0 }
      : unavailable(status),
  };
}

/** Load all live catalog dependencies for one or more voucher rules without N+1 queries. */
export async function loadVoucherAvailabilityCatalog(
  db: VoucherAvailabilityDatabase,
): Promise<VoucherAvailabilityCatalog> {
  const [menuItems, powders, baseLiquids, addonOptions] = await Promise.all([
    db.menuItem.findMany({ include: { sizes: true, allowedBaseLiquids: { select: { base_liquid_id: true } } } }),
    db.matchaPowder.findMany({ select: { id: true, name: true, price_per_gram: true, is_available: true } }),
    db.milkType.findMany({ select: { id: true, is_active: true, is_default: true, display_order: true } }),
    db.addonOption.findMany({ include: { group: { select: { is_active: true } } } }),
  ]);
  return {
    menuItems: menuItems.map((item) => ({ ...item, allowed_base_liquid_ids: item.allowedBaseLiquids.map((row) => row.base_liquid_id) })),
    powders,
    baseLiquids,
    addonOptions: addonOptions.map((option) => ({ ...option, group_is_active: option.group.is_active })),
  };
}

export interface VoucherTargetAvailabilitySource {
  voucher_type: string;
  menu_item_id: string | null;
  size: Size | null;
  eligible_sizes?: Size[];
  reference_size?: Size | null;
  product_discount_mode?: "FIXED_AMOUNT" | "PAY_AS_SIZE" | null;
  matcha_powder_id: string | null;
  milk_type_id: string | null;
  addon_option_id: string | null;
  package: { bundleRule?: VoucherBundleRuleSource | null; [key: string]: unknown };
  [key: string]: unknown;
}

export interface OwnedVoucherAvailabilitySource extends VoucherTargetAvailabilitySource {
  id: string;
  issued_via: string;
  status: string;
  expires_at: Date | null;
  pointsLogs?: Array<{ delta: number; reason: string }>;
}

/** Resolve only the current target/configuration state, independent of voucher lifecycle. */
export function resolveVoucherTargetAvailability(
  voucher: VoucherTargetAvailabilitySource,
  catalog: VoucherAvailabilityCatalog,
): { availability: VoucherAvailability; package: VoucherTargetAvailabilitySource["package"] } {
  if (voucher.voucher_type === "BUNDLE" && voucher.package.bundleRule) {
    const result = resolveBundleRuleAvailability(voucher.package.bundleRule, catalog);
    return { availability: result.availability, package: { ...voucher.package, bundleRule: result.rule } };
  }
  if (voucher.voucher_type === "DISCOUNT" || voucher.voucher_type === "FREESHIP") {
    return { availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 }, package: voucher.package };
  }
  if (voucher.voucher_type === "ADDON") {
    const option = catalog.addonOptions.find((candidate) => candidate.id === voucher.addon_option_id);
    const usable = Boolean(option?.is_active && option.group_is_active && option.gram_value === null);
    return { availability: usable ? { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 } : unavailable("TARGET_UNAVAILABLE"), package: voucher.package };
  }
  if (!voucher.menu_item_id) return { availability: unavailable("TARGET_UNAVAILABLE"), package: voucher.package };
  const currentItem = catalog.menuItems.find((item) => item.id === voucher.menu_item_id);
  if (voucher.voucher_type === "PRODUCT_DISCOUNT") {
    const activeSizes = new Set((currentItem?.sizes ?? []).filter((row) => row.base_price_vnd !== null).map((row) => row.size));
    const hasEligibleSize = (voucher.eligible_sizes ?? []).some((size) => activeSizes.has(size));
    const hasReferenceSize = voucher.product_discount_mode !== "PAY_AS_SIZE" ||
      (voucher.reference_size !== null && voucher.reference_size !== undefined && activeSizes.has(voucher.reference_size));
    if (!hasEligibleSize || !hasReferenceSize) {
      return { availability: unavailable("NO_ACTIVE_CONFIGURATION"), package: voucher.package };
    }
  }
  const currentProductSizes = voucher.voucher_type === "PRODUCT"
    ? (currentItem?.sizes ?? [])
      .filter((size) => size.base_price_vnd !== null)
      .map((size) => ({ size: size.size }))
    : voucher.voucher_type === "PRODUCT_DISCOUNT"
      ? [...(voucher.eligible_sizes ?? []), ...(voucher.reference_size ? [voucher.reference_size] : [])].map((size) => ({ size }))
      : voucher.size ? [{ size: voucher.size }] : [];
  const scope: VoucherBundleScopeSource = {
    role: "QUALIFIER",
    menu_item_id: voucher.menu_item_id,
    default_powder_id: voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "PRODUCT_DISCOUNT" ? null : voucher.matcha_powder_id,
    default_base_liquid_id: voucher.voucher_type === "PRODUCT" || voucher.voucher_type === "PRODUCT_DISCOUNT" ? null : voucher.milk_type_id,
    sizes: currentProductSizes,
  };
  const resolved = filterProductScope(scope, catalog);
  return {
    availability: resolved.scope
      ? { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 }
      : unavailable(resolved.configurationMissing ? "NO_ACTIVE_CONFIGURATION" : "TARGET_UNAVAILABLE"),
    package: voucher.package,
  };
}

/** Attach filtered rules and refund-aware live availability to owned voucher DTO sources. */
export function attachOwnedVoucherAvailability<T extends OwnedVoucherAvailabilitySource>(
  vouchers: T[],
  catalog: VoucherAvailabilityCatalog,
  now = new Date(),
): Array<T & { availability: VoucherAvailability }> {
  return vouchers.map((voucher) => {
    const target = resolveVoucherTargetAvailability(voucher, catalog);
    const lifecycleUsable = voucher.status === "ACTIVE" && (!voucher.expires_at || voucher.expires_at > now);
    const purchaseDelta = voucher.pointsLogs?.find((log) => log.reason === "voucher_purchase")?.delta;
    const refundPoints = purchaseDelta !== undefined ? Math.abs(purchaseDelta) : 0;
    const canRefund = voucher.issued_via === "POINTS_EXCHANGE" && lifecycleUsable &&
      !target.availability.can_apply && refundPoints > 0;
    return {
      ...voucher,
      package: target.package,
      availability: {
        ...target.availability,
        can_apply: lifecycleUsable && target.availability.can_apply,
        can_refund: canRefund,
        refund_points: canRefund ? refundPoints : 0,
      },
    };
  });
}
