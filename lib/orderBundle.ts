import {
  BundlePromotionError,
  assertBundleApplicationCapacity,
  evaluateBundleApplications,
  type BundleEvaluationResult,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
  type BundleSize,
} from "@/lib/promotionBundle";
import { resolveBundleBaselineProducts } from "@/lib/pricing";
import {
  loadVoucherAvailabilityCatalog,
  resolveBundleRuleAvailability,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";

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

export interface OrderBundleDatabase extends VoucherAvailabilityDatabase {
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
  product_voucher_discount_vnd?: number;
  product_voucher_type?: "PRODUCT" | "PRODUCT_DISCOUNT" | null;
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
      product_voucher_quantity: input.product_voucher_id && item.product_voucher_type !== "PRODUCT_DISCOUNT" ? item.quantity : 0,
      product_discount_voucher_quantity: item.product_voucher_type === "PRODUCT_DISCOUNT" && (item.product_voucher_discount_vnd ?? 0) > 0 ? 1 : 0,
      product_discount_vnd: item.product_voucher_type === "PRODUCT_DISCOUNT" ? item.product_voucher_discount_vnd ?? 0 : 0,
      item_voucher_quantity: input.item_voucher_id ? item.quantity : 0,
      addons: item.resolvedAddons.map((addon) => ({ ...addon,
        voucher_discounted_quantity: input.addon_voucher_ids.filter((link) =>
          link.addon_option_id === addon.addon_option_id).length })),
    };
  });
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
  assertBundleApplicationCapacity({ items, applications: input.bundle_applications });
  const tokens = input.bundle_applications.map((application) => application.voucher_qr_token);
  const vouchers = await db.voucher.findMany({ where: { qr_token: { in: tokens } }, include: { package: {
    include: { bundleRule: { include: { productScopes: { include: { sizes: true } }, addonRewards: true } } },
  } } });
  const voucherMap = new Map(vouchers.map((voucher) => [voucher.qr_token, voucher]));
  const catalog = await loadVoucherAvailabilityCatalog(db);
  const now = input.now ?? new Date();
  const prepared: Array<{
    voucher: BundleVoucherRecord;
    application: BundleApplicationInput;
    rule: BundlePromotionRule;
  }> = [];
  const skipped_qr_tokens: string[] = [];
  for (const application of input.bundle_applications) {
    const voucher = voucherMap.get(application.voucher_qr_token);
    assertVoucherUsable(voucher, input.voucher_owner_id, now);
    const live = resolveBundleRuleAvailability(voucher.package.bundleRule, catalog);
    if (!live.availability.can_apply) {
      throw new BundlePromotionError("BUNDLE_VOUCHER_UNAVAILABLE", live.availability.status);
    }
    const record = live.rule;
    const rule = baseRule(record, voucher.package.min_order_vnd);
    prepared.push({ voucher, application, rule });
  }
  const baselineEntries = prepared.flatMap((entry, preparedIndex) =>
    entry.rule.reward_kind === "PRODUCT" && entry.rule.reward_mode !== "SAME_CONFIG"
      ? entry.rule.reward_products.map((product, rewardIndex) => ({ preparedIndex, rewardIndex, product }))
      : [],
  );
  if (baselineEntries.length > 0) {
    const resolved = await resolveBundleBaselineProducts(
      db as unknown as Parameters<typeof resolveBundleBaselineProducts>[0],
      baselineEntries.map((entry) => entry.product),
    );
    baselineEntries.forEach((entry, index) => {
      prepared[entry.preparedIndex]!.rule.reward_products[entry.rewardIndex] = resolved[index]!;
    });
  }
  const evaluated = evaluateBundleApplications({
    items,
    applications: prepared.map(({ application, rule }) => ({ ...application, rule })),
  });
  const bundles = prepared.flatMap(({ voucher, application }) => {
    const evaluation = evaluated.evaluations.find((item) => item.voucher_qr_token === application.voucher_qr_token)?.evaluation;
    if (!evaluation || evaluation.total_discount_vnd <= 0) {
      skipped_qr_tokens.push(application.voucher_qr_token);
      return [];
    }
    return [{ voucher_id: voucher.id, package_id: voucher.package.id, qualifier_allocations: application.qualifier_allocations, evaluation }];
  });
  const line_discounts_vnd = items.map((item) => evaluated.line_discounts_vnd.get(item.client_line_id) ?? 0);
  return { bundles, line_discounts_vnd, skipped_qr_tokens };
}
