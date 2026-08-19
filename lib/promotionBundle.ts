import {
  BundlePromotionError,
  type BundleCartItem,
  type BundleEvaluationResult,
  type BundleProductDefinition,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
  type BundleRewardResult,
  type BundleSize,
} from "@/lib/promotionBundleTypes";

export { BundlePromotionError } from "@/lib/promotionBundleTypes";
export type {
  BundleCartAddon, BundleCartItem, BundleEvaluationResult, BundleProductDefinition,
  BundlePromotionRule, BundleQualifierAllocation, BundleRewardAllocation,
  BundleRewardResult, BundleSize,
} from "@/lib/promotionBundleTypes";

const SIZE_RANK: Record<BundleSize, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2 };

function productMatches(item: BundleCartItem, product: BundleProductDefinition): boolean {
  return item.menu_item_id === product.menu_item_id &&
    (item.size === null ? product.allowed_sizes.length === 0 : product.allowed_sizes.includes(item.size));
}

function assertRule(rule: BundlePromotionRule): void {
  if (rule.buy_quantity < 1 || rule.reward_quantity < 1 ||
      rule.max_applications_per_order < 1 || rule.qualifier_products.length === 0) {
    throw new BundlePromotionError("BUNDLE_INVALID_RULE", "Bundle rule is incomplete");
  }
}

function itemMap(items: BundleCartItem[]): Map<string, BundleCartItem> {
  const result = new Map<string, BundleCartItem>();
  for (const item of items) {
    if (result.has(item.client_line_id)) {
      throw new BundlePromotionError("BUNDLE_DUPLICATE_LINE", "Cart line IDs must be unique");
    }
    result.set(item.client_line_id, item);
  }
  return result;
}

function assertUniqueAllocations(
  qualifiers: BundleQualifierAllocation[], rewards: BundleRewardAllocation[],
): void {
  const qualifierKeys = new Set<string>();
  const rewardKeys = new Set<string>();
  for (const allocation of qualifiers) {
    if (allocation.quantity < 1 || qualifierKeys.has(allocation.client_line_id)) {
      throw new BundlePromotionError("BUNDLE_DUPLICATE_ALLOCATION", "Invalid qualifier allocation");
    }
    qualifierKeys.add(allocation.client_line_id);
  }
  for (const allocation of rewards) {
    const key = `${allocation.client_line_id}:${allocation.addon_option_id ?? "PRODUCT"}`;
    if (allocation.quantity < 1 || rewardKeys.has(key)) {
      throw new BundlePromotionError("BUNDLE_DUPLICATE_ALLOCATION", "Invalid reward allocation");
    }
    rewardKeys.add(key);
  }
}

function availableProductQuantity(item: BundleCartItem): number {
  return Math.max(0, item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0));
}

function assertProductCapacity(
  items: Map<string, BundleCartItem>, qualifiers: BundleQualifierAllocation[],
  rewards: BundleRewardAllocation[], rewardKind: "PRODUCT" | "ADDON",
): void {
  const used = new Map<string, number>();
  for (const allocation of qualifiers) {
    used.set(allocation.client_line_id, (used.get(allocation.client_line_id) ?? 0) + allocation.quantity);
  }
  if (rewardKind === "PRODUCT") {
    for (const allocation of rewards) {
      used.set(allocation.client_line_id, (used.get(allocation.client_line_id) ?? 0) + allocation.quantity);
    }
  }
  for (const [lineId, quantity] of used) {
    const item = items.get(lineId);
    if (!item || quantity > availableProductQuantity(item)) {
      throw new BundlePromotionError("BUNDLE_CONFLICT", "Bundle allocations exceed paid product units");
    }
  }
}

function paidSubtotal(
  items: BundleCartItem[], rewards: BundleRewardAllocation[],
): number {
  const productRewards = new Map<string, number>();
  const addonRewards = new Map<string, number>();
  for (const reward of rewards) {
    if (reward.addon_option_id) addonRewards.set(`${reward.client_line_id}:${reward.addon_option_id}`, reward.quantity);
    else productRewards.set(reward.client_line_id, (productRewards.get(reward.client_line_id) ?? 0) + reward.quantity);
  }
  return items.reduce((total, item) => {
    const productQuantity = Math.max(0, availableProductQuantity(item) - (productRewards.get(item.client_line_id) ?? 0));
    const addonTotal = item.addons.reduce((sum, addon) => {
      const quantity = Math.max(0, addon.quantity - (addon.voucher_discounted_quantity ?? 0) -
        (addonRewards.get(`${item.client_line_id}:${addon.addon_option_id}`) ?? 0));
      return sum + quantity * addon.unit_price_vnd;
    }, 0);
    return total + productQuantity * item.unit_price_vnd + addonTotal;
  }, 0);
}

function assertMinimum(rule: BundlePromotionRule, subtotal: number): void {
  if (rule.min_order_vnd !== null && subtotal < rule.min_order_vnd) {
    throw new BundlePromotionError("BUNDLE_MIN_ORDER_NOT_MET", "Paid subtotal is below bundle minimum");
  }
}

function expandItems(
  allocations: BundleQualifierAllocation[], items: Map<string, BundleCartItem>,
): BundleCartItem[] {
  return allocations.flatMap((allocation) => {
    const item = items.get(allocation.client_line_id);
    if (!item) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Allocation line is missing");
    return Array.from({ length: allocation.quantity }, () => item);
  });
}

function baselineForProduct(product: BundleProductDefinition, item: BundleCartItem): number {
  const value = item.size === null ? product.baseline_price_vnd : product.baseline_prices_vnd[item.size];
  if (value === undefined || value <= 0) {
    throw new BundlePromotionError("BUNDLE_INVALID_RULE", "Reward baseline is unavailable");
  }
  return value;
}

function aggregateRewards(
  allocations: BundleRewardAllocation[], discounts: Map<string, number>,
): BundleRewardResult[] {
  return allocations.map((allocation) => ({
    client_line_id: allocation.client_line_id,
    addon_option_id: allocation.addon_option_id ?? null,
    quantity: allocation.quantity,
    discount_vnd: discounts.get(`${allocation.client_line_id}:${allocation.addon_option_id ?? "PRODUCT"}`) ?? 0,
  }));
}

function evaluateProduct(
  rule: BundlePromotionRule, items: Map<string, BundleCartItem>,
  qualifiers: BundleQualifierAllocation[], rewards: BundleRewardAllocation[],
): BundleEvaluationResult {
  if (rewards.some((reward) => reward.addon_option_id !== undefined)) {
    throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Product rewards cannot target addons");
  }
  const rewardTotal = rewards.reduce((sum, reward) => sum + reward.quantity, 0);
  if (rewardTotal === 0 || rewardTotal % rule.reward_quantity !== 0) {
    throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Selected reward quantity is incomplete");
  }
  const applicationCount = rewardTotal / rule.reward_quantity;
  if (applicationCount > rule.max_applications_per_order ||
      (rule.max_reward_units_per_order !== null && rewardTotal > rule.max_reward_units_per_order)) {
    throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Bundle reward limit exceeded");
  }
  const qualifierUnits = expandItems(qualifiers, items);
  const rewardUnits = expandItems(rewards, items);
  for (const item of qualifierUnits) {
    if (!rule.qualifier_products.some((product) => productMatches(item, product))) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Qualifier is outside scope");
    }
  }
  const unitDiscounts = new Map<string, number>();
  if (rule.reward_mode === "SAME_CONFIG") {
    const menuIds = new Set(rewardUnits.map((item) => item.menu_item_id));
    for (const menuId of menuIds) {
      const menuRewards = rewardUnits.filter((item) => item.menu_item_id === menuId);
      const menuQualifiers = qualifierUnits.filter((item) => item.menu_item_id === menuId);
      if (menuRewards.length % rule.reward_quantity !== 0 ||
          menuQualifiers.length !== (menuRewards.length / rule.reward_quantity) * rule.buy_quantity) {
        throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "SAME_CONFIG requires complete same-product groups");
      }
      const definition = rule.qualifier_products.find((product) => product.menu_item_id === menuId);
      if (!definition || menuRewards.some((item) => !productMatches(item, definition))) {
        throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward must use the same allowed product");
      }
      const sortedQualifiers = [...menuQualifiers].sort((a, b) =>
        ((b.size ? SIZE_RANK[b.size] : -1) - (a.size ? SIZE_RANK[a.size] : -1)) ||
        b.unit_price_vnd - a.unit_price_vnd || a.client_line_id.localeCompare(b.client_line_id));
      const baselines: number[] = [];
      for (let index = 0; index < sortedQualifiers.length; index += rule.buy_quantity) {
        const group = sortedQualifiers.slice(index, index + rule.buy_quantity);
        const smallestRank = Math.min(...group.map((item) => item.size ? SIZE_RANK[item.size] : -1));
        baselines.push(Math.min(...group.filter((item) => (item.size ? SIZE_RANK[item.size] : -1) === smallestRank)
          .map((item) => item.unit_price_vnd)));
      }
      baselines.sort((a, b) => b - a);
      const sortedRewards = [...menuRewards].sort((a, b) => b.unit_price_vnd - a.unit_price_vnd ||
        a.client_line_id.localeCompare(b.client_line_id));
      sortedRewards.forEach((item, index) => {
        const baseline = baselines[Math.floor(index / rule.reward_quantity)] ?? 0;
        const key = `${item.client_line_id}:PRODUCT`;
        unitDiscounts.set(key, (unitDiscounts.get(key) ?? 0) + Math.min(item.unit_price_vnd, baseline));
      });
    }
  } else {
    if (qualifierUnits.length !== applicationCount * rule.buy_quantity) {
      throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Qualifier quantity is incomplete");
    }
    for (const item of rewardUnits) {
      const product = rule.reward_products.find((candidate) => productMatches(item, candidate));
      if (!product) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward is outside scope");
      const key = `${item.client_line_id}:PRODUCT`;
      unitDiscounts.set(key, (unitDiscounts.get(key) ?? 0) +
        Math.min(item.unit_price_vnd, baselineForProduct(product, item)));
    }
  }
  const resultRewards = aggregateRewards(rewards, unitDiscounts);
  return { application_count: applicationCount,
    total_discount_vnd: resultRewards.reduce((sum, reward) => sum + reward.discount_vnd, 0), rewards: resultRewards };
}

function evaluateAddon(
  rule: BundlePromotionRule, items: Map<string, BundleCartItem>,
  qualifiers: BundleQualifierAllocation[], rewards: BundleRewardAllocation[],
): BundleEvaluationResult {
  const qualifierUnits = expandItems(qualifiers, items);
  if (qualifierUnits.some((item) => !rule.qualifier_products.some((product) => productMatches(item, product)))) {
    throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Qualifier is outside scope");
  }
  const qualifierTotal = qualifierUnits.length;
  const rewardTotal = rewards.reduce((sum, reward) => sum + reward.quantity, 0);
  let applicationCount: number;
  let expectedRewards: number;
  if (rule.benefit_scaling === "ONCE_PER_ORDER") {
    applicationCount = 1; expectedRewards = rule.reward_quantity;
    if (qualifierTotal !== rule.buy_quantity) throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Qualifier quantity is incomplete");
  } else if (rule.benefit_scaling === "PER_QUALIFYING_ITEM") {
    if (qualifierTotal < rule.buy_quantity || qualifierTotal > rule.buy_quantity * rule.max_applications_per_order) {
      throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Qualifier quantity exceeds scaling limit");
    }
    applicationCount = qualifierTotal; expectedRewards = qualifierTotal * rule.reward_quantity;
  } else {
    if (rewardTotal === 0 || rewardTotal % rule.reward_quantity !== 0) {
      throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Selected addon reward is incomplete");
    }
    applicationCount = rewardTotal / rule.reward_quantity;
    if (applicationCount > rule.max_applications_per_order || qualifierTotal !== applicationCount * rule.buy_quantity) {
      throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Addon bundle groups are incomplete");
    }
    expectedRewards = applicationCount * rule.reward_quantity;
  }
  if (rule.max_reward_units_per_order !== null) expectedRewards = Math.min(expectedRewards, rule.max_reward_units_per_order);
  if (rewardTotal !== expectedRewards) throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Addon reward quantity is invalid");
  const qualifierLines = new Set(qualifiers.map((allocation) => allocation.client_line_id));
  const discounts = new Map<string, number>();
  for (const allocation of rewards) {
    const item = items.get(allocation.client_line_id);
    if (!item || !qualifierLines.has(allocation.client_line_id) || !allocation.addon_option_id ||
        !rule.reward_addon_option_ids.includes(allocation.addon_option_id)) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon reward must target its qualifier pool");
    }
    const addon = item.addons.find((candidate) => candidate.addon_option_id === allocation.addon_option_id);
    if (!addon) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon is missing from qualifier line");
    if (addon.gram_value !== null) {
      throw new BundlePromotionError("BUNDLE_EXTRA_MATCHA_BLOCKED", "Extra Matcha cannot be a bundle reward");
    }
    if (allocation.quantity + (addon.voucher_discounted_quantity ?? 0) > addon.quantity) {
      throw new BundlePromotionError("BUNDLE_CONFLICT", "Addon reward overlaps another benefit");
    }
    discounts.set(`${item.client_line_id}:${addon.addon_option_id}`, addon.unit_price_vnd * allocation.quantity);
  }
  const resultRewards = aggregateRewards(rewards, discounts);
  return { application_count: applicationCount,
    total_discount_vnd: resultRewards.reduce((sum, reward) => sum + reward.discount_vnd, 0), rewards: resultRewards };
}

/** Evaluate one explicit BUNDLE allocation pool against server-resolved prices. */
export function evaluateBundlePromotion(input: {
  rule: BundlePromotionRule;
  items: BundleCartItem[];
  qualifier_allocations: BundleQualifierAllocation[];
  reward_allocations: BundleRewardAllocation[];
  paid_merchandise_subtotal_vnd?: number;
}): BundleEvaluationResult {
  assertRule(input.rule);
  assertUniqueAllocations(input.qualifier_allocations, input.reward_allocations);
  const items = itemMap(input.items);
  assertProductCapacity(items, input.qualifier_allocations, input.reward_allocations, input.rule.reward_kind);
  assertMinimum(input.rule, input.paid_merchandise_subtotal_vnd ?? paidSubtotal(input.items, input.reward_allocations));
  return input.rule.reward_kind === "PRODUCT"
    ? evaluateProduct(input.rule, items, input.qualifier_allocations, input.reward_allocations)
    : evaluateAddon(input.rule, items, input.qualifier_allocations, input.reward_allocations);
}
