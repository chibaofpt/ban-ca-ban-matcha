import {
  BundlePromotionError,
  evaluateBundlePromotion,
  type BundleEvaluationResult,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
  type BundleSize,
} from "@/lib/promotionBundle";
import { resolveBundleBaselineProducts } from "@/lib/pricing";

interface BundleScopeRecord {
  role: "QUALIFIER" | "REWARD";
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  sizes: Array<{ size: BundleSize }>;
}

interface BundleRuleRecord {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  max_applications_order: number;
  max_reward_units_order: number | null;
  productScopes: BundleScopeRecord[];
  addonRewards: Array<{ addon_option_id: string }>;
}

interface BundleVoucherRecord {
  id: string;
  qr_token: string;
  user_id: string;
  voucher_type: string;
  status: string;
  expires_at: Date | null;
  package: { id: string; ends_at: Date | null; min_order_vnd: number | null; bundleRule: BundleRuleRecord | null };
}

export interface OrderBundleDatabase {
  voucher: { findMany: (args: unknown) => Promise<BundleVoucherRecord[]> };
}

interface BundleOrderItemInput {
  client_line_id?: string;
  product_voucher_id?: string;
  item_voucher_id?: string;
  addon_voucher_ids: Array<{ voucher_id: string; addon_option_id: string }>;
}

interface BundleResolvedItem {
  menu_item_id: string;
  size: BundleSize | null;
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
  unit_price_vnd: number;
  quantity: number;
  resolvedAddons: Array<{ addon_option_id: string; quantity: number; unit_price_vnd: number; gram_value: number | null }>;
}

export interface BundleApplicationInput {
  voucher_qr_token: string;
  qualifier_allocations: BundleQualifierAllocation[];
  reward_allocations: BundleRewardAllocation[];
}

export interface ResolvedOrderBundle {
  voucher_id: string;
  package_id: string;
  qualifier_allocations: BundleQualifierAllocation[];
  evaluation: BundleEvaluationResult;
}

export interface ResolvedOrderBundles {
  bundles: ResolvedOrderBundle[];
  line_discounts_vnd: number[];
  skipped_qr_tokens: string[];
}

function assertVoucherUsable(voucher: BundleVoucherRecord | undefined, userId: string, now: Date): asserts voucher is BundleVoucherRecord & {
  package: BundleVoucherRecord["package"] & { bundleRule: BundleRuleRecord };
} {
  if (!voucher || voucher.user_id !== userId) throw new BundlePromotionError("BUNDLE_VOUCHER_NOT_FOUND", "Bundle voucher not found");
  if (voucher.voucher_type !== "BUNDLE" || voucher.status !== "ACTIVE") {
    throw new BundlePromotionError("BUNDLE_VOUCHER_UNAVAILABLE", "Bundle voucher is unavailable");
  }
  if ((voucher.expires_at && voucher.expires_at <= now) ||
      (voucher.package.ends_at && now >= voucher.package.ends_at)) {
    throw new BundlePromotionError("BUNDLE_VOUCHER_EXPIRED", "Bundle voucher is expired");
  }
  if (!voucher.package.bundleRule) throw new BundlePromotionError("BUNDLE_INVALID_RULE", "Bundle rule is missing");
}

function cartItems(
  inputs: BundleOrderItemInput[], resolved: BundleResolvedItem[],
) {
  if (inputs.length !== resolved.length) throw new BundlePromotionError("BUNDLE_INVALID_ORDER", "Order lines are inconsistent");
  return resolved.map((item, index) => {
    const input = inputs[index];
    if (!input?.client_line_id) throw new BundlePromotionError("BUNDLE_INVALID_ORDER", "Bundle line ID is missing");
    return {
      client_line_id: input.client_line_id, menu_item_id: item.menu_item_id, size: item.size,
      selected_powder_id: item.selected_powder_id, selected_milk_type_id: item.selected_milk_type_id,
      unit_price_vnd: item.unit_price_vnd, quantity: item.quantity,
      product_voucher_quantity: input.product_voucher_id ? item.quantity : 0,
      item_voucher_quantity: input.item_voucher_id ? item.quantity : 0,
      addons: item.resolvedAddons.map((addon) => ({ ...addon,
        voucher_discounted_quantity: input.addon_voucher_ids.filter((link) =>
          link.addon_option_id === addon.addon_option_id).length })),
    };
  });
}

function assertGlobalAllocationCapacity(
  applications: BundleApplicationInput[], items: ReturnType<typeof cartItems>,
): void {
  const itemMap = new Map(items.map((item) => [item.client_line_id, item]));
  const productUsage = new Map<string, number>();
  const addonUsage = new Map<string, number>();
  const tokens = new Set<string>();
  for (const application of applications) {
    if (tokens.has(application.voucher_qr_token)) {
      throw new BundlePromotionError("BUNDLE_DUPLICATE_VOUCHER", "Bundle token can appear only once");
    }
    tokens.add(application.voucher_qr_token);
    for (const allocation of application.qualifier_allocations) {
      productUsage.set(allocation.client_line_id, (productUsage.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    }
    for (const allocation of application.reward_allocations) {
      if (allocation.addon_option_id) {
        const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
        addonUsage.set(key, (addonUsage.get(key) ?? 0) + allocation.quantity);
      } else {
        productUsage.set(allocation.client_line_id, (productUsage.get(allocation.client_line_id) ?? 0) + allocation.quantity);
      }
    }
  }
  for (const [lineId, quantity] of productUsage) {
    const item = itemMap.get(lineId);
    const available = item ? item.quantity - item.product_voucher_quantity - item.item_voucher_quantity : 0;
    if (!item || quantity > available) {
      throw new BundlePromotionError("BUNDLE_ALLOCATION_OVERLAP", "Product unit is allocated more than once");
    }
  }
  for (const [key, quantity] of addonUsage) {
    const separator = key.lastIndexOf(":");
    const lineId = key.slice(0, separator);
    const addonId = key.slice(separator + 1);
    const addon = itemMap.get(lineId)?.addons.find((candidate) => candidate.addon_option_id === addonId);
    if (!addon || quantity + addon.voucher_discounted_quantity > addon.quantity) {
      throw new BundlePromotionError("BUNDLE_ALLOCATION_OVERLAP", "Addon unit is allocated more than once");
    }
  }
}

function globalPaidSubtotal(
  applications: BundleApplicationInput[], items: ReturnType<typeof cartItems>,
): number {
  const productRewards = new Map<string, number>();
  const addonRewards = new Map<string, number>();
  for (const application of applications) for (const reward of application.reward_allocations) {
    const key = `${reward.client_line_id}:${reward.addon_option_id ?? "PRODUCT"}`;
    const target = reward.addon_option_id ? addonRewards : productRewards;
    target.set(key, (target.get(key) ?? 0) + reward.quantity);
  }
  return items.reduce((total, item) => {
    const products = Math.max(0, item.quantity - item.product_voucher_quantity - item.item_voucher_quantity -
      (productRewards.get(`${item.client_line_id}:PRODUCT`) ?? 0));
    const addons = item.addons.reduce((sum, addon) => sum + Math.max(0,
      addon.quantity - addon.voucher_discounted_quantity -
      (addonRewards.get(`${item.client_line_id}:${addon.addon_option_id}`) ?? 0)) * addon.unit_price_vnd, 0);
    return total + products * item.unit_price_vnd + addons;
  }, 0);
}

function baseRule(record: BundleRuleRecord, minOrderVnd: number | null): BundlePromotionRule {
  const mapProduct = (scope: BundleScopeRecord) => ({ menu_item_id: scope.menu_item_id,
    allowed_sizes: scope.sizes.map((row) => row.size), default_powder_id: scope.default_powder_id,
    default_base_liquid_id: scope.default_base_liquid_id, baseline_prices_vnd: {} });
  return { min_order_vnd: minOrderVnd, buy_quantity: record.buy_quantity,
    reward_quantity: record.reward_quantity, reward_kind: record.reward_kind, reward_mode: record.reward_mode,
    benefit_scaling: record.benefit_scaling, max_applications_per_order: record.max_applications_order,
    max_reward_units_per_order: record.max_reward_units_order,
    qualifier_products: record.productScopes.filter((scope) => scope.role === "QUALIFIER").map(mapProduct),
    reward_products: record.productScopes.filter((scope) => scope.role === "REWARD").map(mapProduct),
    reward_addon_option_ids: record.addonRewards.map((reward) => reward.addon_option_id) };
}

/** Resolve and evaluate every explicitly allocated BUNDLE voucher for one order. */
export async function resolveOrderBundles(
  db: OrderBundleDatabase,
  input: { voucher_owner_id: string; now?: Date; items: BundleOrderItemInput[];
    resolved_items: BundleResolvedItem[]; bundle_applications: BundleApplicationInput[] },
): Promise<ResolvedOrderBundles> {
  if (input.bundle_applications.length === 0) {
    return { bundles: [], line_discounts_vnd: input.items.map(() => 0), skipped_qr_tokens: [] };
  }
  const items = cartItems(input.items, input.resolved_items);
  assertGlobalAllocationCapacity(input.bundle_applications, items);
  const tokens = input.bundle_applications.map((application) => application.voucher_qr_token);
  const vouchers = await db.voucher.findMany({ where: { qr_token: { in: tokens } }, include: { package: {
    include: { bundleRule: { include: { productScopes: { include: { sizes: true } }, addonRewards: true } } },
  } } });
  const voucherMap = new Map(vouchers.map((voucher) => [voucher.qr_token, voucher]));
  const now = input.now ?? new Date();
  const paidSubtotal = globalPaidSubtotal(input.bundle_applications, items);
  const bundles: ResolvedOrderBundle[] = [];
  const skipped_qr_tokens: string[] = [];
  for (const application of input.bundle_applications) {
    const voucher = voucherMap.get(application.voucher_qr_token);
    assertVoucherUsable(voucher, input.voucher_owner_id, now);
    const record = voucher.package.bundleRule;
    const rule = baseRule(record, voucher.package.min_order_vnd);
    if (rule.reward_kind === "PRODUCT" && rule.reward_mode !== "SAME_CONFIG") {
      rule.reward_products = await resolveBundleBaselineProducts(db as unknown as Parameters<typeof resolveBundleBaselineProducts>[0],
        rule.reward_products);
    }
    const evaluation = evaluateBundlePromotion({ rule, items,
      qualifier_allocations: application.qualifier_allocations,
      reward_allocations: application.reward_allocations,
      paid_merchandise_subtotal_vnd: paidSubtotal });
    if (evaluation.total_discount_vnd <= 0) {
      skipped_qr_tokens.push(application.voucher_qr_token);
      continue;
    }
    bundles.push({ voucher_id: voucher.id, package_id: voucher.package.id,
      qualifier_allocations: application.qualifier_allocations, evaluation });
  }
  const line_discounts_vnd = items.map((item) => bundles.reduce((bundleTotal, bundle) =>
    bundleTotal + bundle.evaluation.rewards.filter((reward) => reward.client_line_id === item.client_line_id)
      .reduce((sum, reward) => sum + reward.discount_vnd, 0), 0));
  return { bundles, line_discounts_vnd, skipped_qr_tokens };
}
