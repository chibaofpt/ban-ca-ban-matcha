import { BundlePromotionError, type BundleCartItem, type BundleEvaluationResult,
  type BundleProductScope, type BundlePromotionRule, type BundleRewardAllocation,
  type BundleRewardResult } from "@/lib/promotionBundleTypes";

export { BundlePromotionError } from "@/lib/promotionBundleTypes";
export type { BundleCartAddon, BundleCartItem, BundleEvaluationResult,
  BundleProductScope, BundlePromotionRule, BundleRewardAllocation,
  BundleRewardResult, BundleSize } from "@/lib/promotionBundleTypes";

function matchesScope(item: BundleCartItem, scope: BundleProductScope): boolean {
  return (
    item.menu_item_id === scope.menu_item_id &&
    (scope.size === null || item.size === scope.size) &&
    (scope.powder_id === null || item.selected_powder_id === scope.powder_id) &&
    (scope.milk_type_id === null || item.selected_milk_type_id === scope.milk_type_id)
  );
}

function configKey(item: BundleCartItem): string {
  return [
    item.menu_item_id,
    item.size,
    item.selected_powder_id ?? "",
    item.selected_milk_type_id ?? "",
  ].join(":");
}

function assertBaseRule(rule: BundlePromotionRule): void {
  if (
    rule.buy_quantity < 1 ||
    rule.reward_quantity < 1 ||
    rule.max_applications_per_order < 1 ||
    rule.qualifier_scopes.length === 0
  ) {
    throw new BundlePromotionError("BUNDLE_INVALID_RULE", "Bundle rule is incomplete");
  }
}

function getBundleEligibleSubtotal(
  items: BundleCartItem[],
  allocations: BundleRewardAllocation[],
): number {
  const productRewards = new Map<string, number>();
  const addonRewards = new Map<string, number>();
  for (const allocation of allocations) {
    if (allocation.addon_option_id) {
      addonRewards.set(
        `${allocation.client_line_id}:${allocation.addon_option_id}`,
        allocation.quantity,
      );
    } else {
      productRewards.set(
        allocation.client_line_id,
        (productRewards.get(allocation.client_line_id) ?? 0) + allocation.quantity,
      );
    }
  }
  return items.reduce((orderTotal, item) => {
    const cleanDrinkQuantity = Math.max(
      0,
      item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0) - (productRewards.get(item.client_line_id) ?? 0),
    );
    const addonTotal = item.addons.reduce((sum, addon) => {
      const cleanAddonQuantity = Math.max(
        0,
        addon.quantity - (addon.voucher_discounted_quantity ?? 0) - (addonRewards.get(`${item.client_line_id}:${addon.addon_option_id}`) ?? 0),
      );
      return sum + cleanAddonQuantity * addon.unit_price_vnd;
    }, 0);
    return orderTotal + cleanDrinkQuantity * item.unit_price_vnd + addonTotal;
  }, 0);
}

function assertMinimumOrder(
  rule: BundlePromotionRule,
  items: BundleCartItem[],
  allocations: BundleRewardAllocation[],
): void {
  if (rule.min_order_vnd !== null && getBundleEligibleSubtotal(items, allocations) < rule.min_order_vnd) {
    throw new BundlePromotionError(
      "BUNDLE_MIN_ORDER_NOT_MET",
      "Eligible merchandise subtotal is below the bundle minimum",
    );
  }
}

function allocationKey(allocation: BundleRewardAllocation): string {
  return `${allocation.client_line_id}:${allocation.addon_option_id ?? "PRODUCT"}`;
}

function assertAllocationsUnique(allocations: BundleRewardAllocation[]): void {
  const keys = new Set<string>();
  for (const allocation of allocations) {
    if (allocation.quantity < 1) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward quantity must be positive");
    }
    const key = allocationKey(allocation);
    if (keys.has(key)) {
      throw new BundlePromotionError(
        "BUNDLE_DUPLICATE_ALLOCATION",
        "A reward target can only appear once",
      );
    }
    keys.add(key);
  }
}

function getItemMap(items: BundleCartItem[]): Map<string, BundleCartItem> {
  const map = new Map<string, BundleCartItem>();
  for (const item of items) {
    if (map.has(item.client_line_id)) {
      throw new BundlePromotionError("BUNDLE_DUPLICATE_LINE", "Cart line IDs must be unique");
    }
    map.set(item.client_line_id, item);
  }
  return map;
}

function getProductResult(
  rule: BundlePromotionRule,
  items: BundleCartItem[],
  allocations: BundleRewardAllocation[],
): BundleEvaluationResult {
  if (allocations.some((allocation) => allocation.addon_option_id !== undefined)) {
    throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Product rewards cannot target addons");
  }
  const itemMap = getItemMap(items);
  const rewardByLine = new Map<string, number>();
  let rewardTotal = 0;
  for (const allocation of allocations) {
    const item = itemMap.get(allocation.client_line_id);
    const itemVoucherQuantity = item?.item_voucher_quantity ?? 0;
    if (
      item &&
      (item.product_voucher_quantity > 0 || itemVoucherQuantity > 0) &&
      allocation.quantity > item.quantity - item.product_voucher_quantity - itemVoucherQuantity
    ) {
      throw new BundlePromotionError(
        "BUNDLE_CONFLICT",
        "PRODUCT voucher units cannot receive bundle rewards",
      );
    }
    if (!item || allocation.quantity > item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0)) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward item is missing from cart");
    }
    rewardByLine.set(item.client_line_id, allocation.quantity);
    rewardTotal += allocation.quantity;
  }
  if (rewardTotal === 0 || rewardTotal % rule.reward_quantity !== 0) {
    throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Selected reward quantity is incomplete");
  }
  if (rule.max_reward_units_per_order !== null && rewardTotal > rule.max_reward_units_per_order) {
    throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Reward quantity exceeds campaign cap");
  }

  const applicationCount = rewardTotal / rule.reward_quantity;
  if (applicationCount > rule.max_applications_per_order) {
    throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Too many bundle applications");
  }
  const eligibleItems = items.filter((item) =>
    rule.qualifier_scopes.some((scope) => matchesScope(item, scope)),
  );
  const totalPaidQuantity = eligibleItems.reduce(
    (sum, item) =>
      sum + item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0) - (rewardByLine.get(item.client_line_id) ?? 0),
    0,
  );
  if (totalPaidQuantity < applicationCount * rule.buy_quantity) {
    throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Not enough paid qualifying products");
  }

  if (rule.reward_mode === "SAME_CONFIG") {
    const paidByConfig = new Map<string, number>();
    const rewardsByConfig = new Map<string, number>();
    for (const item of eligibleItems) {
      const rewardQuantity = rewardByLine.get(item.client_line_id) ?? 0;
      const key = configKey(item);
      paidByConfig.set(
        key,
        (paidByConfig.get(key) ?? 0) + item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0) - rewardQuantity,
      );
      rewardsByConfig.set(key, (rewardsByConfig.get(key) ?? 0) + rewardQuantity);
    }
    for (const allocation of allocations) {
      const item = itemMap.get(allocation.client_line_id);
      if (!item || !eligibleItems.includes(item)) {
        throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward must match paid configuration");
      }
    }
    for (const [key, count] of rewardsByConfig) {
      if (count === 0) continue;
      if (count % rule.reward_quantity !== 0) {
        throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward groups cannot mix configurations");
      }
      const requiredPaid = (count / rule.reward_quantity) * rule.buy_quantity;
      if ((paidByConfig.get(key) ?? 0) < requiredPaid) {
        throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "No matching paid configuration");
      }
    }
  } else {
    // The aggregate paid quantity was checked before mode-specific matching.
  }

  const rewards = allocations.map((allocation): BundleRewardResult => {
    const item = itemMap.get(allocation.client_line_id);
    if (!item) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward item is missing from cart");
    }
    if (rule.reward_mode === "SAME_CONFIG") {
      return {
        client_line_id: item.client_line_id,
        addon_option_id: null,
        quantity: allocation.quantity,
        discount_vnd: item.unit_price_vnd * allocation.quantity,
      };
    }
    const scope = rule.reward_product_scopes.find((candidate) => matchesScope(item, candidate));
    if (!scope) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Reward product is outside scope");
    }
    const coveredUnit =
      rule.reward_mode === "ALLOWED_SCOPE"
        ? Math.min(item.unit_price_vnd, scope.reference_price_vnd ?? 0)
        : item.unit_price_vnd;
    if (coveredUnit <= 0) {
      throw new BundlePromotionError("BUNDLE_NO_BENEFIT", "Bundle creates no price benefit");
    }
    return {
      client_line_id: item.client_line_id,
      addon_option_id: null,
      quantity: allocation.quantity,
      discount_vnd: coveredUnit * allocation.quantity,
    };
  });

  return {
    application_count: applicationCount,
    total_discount_vnd: rewards.reduce((sum, reward) => sum + reward.discount_vnd, 0),
    rewards,
  };
}

function getAddonResult(
  rule: BundlePromotionRule,
  items: BundleCartItem[],
  allocations: BundleRewardAllocation[],
): BundleEvaluationResult {
  const itemMap = getItemMap(items);
  const eligibleItems = items.filter((item) =>
    rule.qualifier_scopes.some((scope) => matchesScope(item, scope)),
  );
  const paidQuantity = eligibleItems.reduce(
    (sum, item) => sum + item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0),
    0,
  );
  if (paidQuantity < rule.buy_quantity) {
    throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Not enough paid qualifying products");
  }

  const rewardTotal = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  let applicationCount = 1;
  let allowedRewardTotal: number;
  if (rule.benefit_scaling === "PER_BUNDLE") {
    if (rewardTotal === 0 || rewardTotal % rule.reward_quantity !== 0) {
      throw new BundlePromotionError("BUNDLE_NOT_ELIGIBLE", "Selected addon reward is incomplete");
    }
    applicationCount = rewardTotal / rule.reward_quantity;
    if (
      applicationCount > rule.max_applications_per_order ||
      paidQuantity < applicationCount * rule.buy_quantity
    ) {
      throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Addon reward exceeds bundle groups");
    }
    allowedRewardTotal = applicationCount * rule.reward_quantity;
  } else if (rule.benefit_scaling === "PER_QUALIFYING_ITEM") {
    allowedRewardTotal = Math.min(
      paidQuantity,
      rule.buy_quantity * rule.max_applications_per_order,
    ) * rule.reward_quantity;
  } else {
    allowedRewardTotal = rule.reward_quantity;
  }
  if (rule.max_reward_units_per_order !== null) {
    allowedRewardTotal = Math.min(allowedRewardTotal, rule.max_reward_units_per_order);
  }
  if (rewardTotal !== allowedRewardTotal) {
    throw new BundlePromotionError("BUNDLE_REWARD_LIMIT", "Addon reward quantity does not match rule");
  }

  const rewards = allocations.map((allocation): BundleRewardResult => {
    const item = itemMap.get(allocation.client_line_id);
    if (
      !item ||
      !eligibleItems.includes(item) ||
      item.quantity <= item.product_voucher_quantity + (item.item_voucher_quantity ?? 0) ||
      !allocation.addon_option_id
    ) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon reward target is invalid");
    }
    if (!rule.reward_addon_option_ids.includes(allocation.addon_option_id)) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon reward is outside scope");
    }
    const addon = item.addons.find(
      (candidate) => candidate.addon_option_id === allocation.addon_option_id,
    );
    if (!addon || allocation.quantity > addon.quantity) {
      throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon is missing from cart item");
    }
    if (addon.gram_value !== null && addon.gram_value > 0) {
      throw new BundlePromotionError("BUNDLE_EXTRA_MATCHA_BLOCKED", "Extra Matcha is not eligible");
    }
    if ((addon.voucher_discounted_quantity ?? 0) + allocation.quantity > addon.quantity) {
      throw new BundlePromotionError("BUNDLE_CONFLICT", "Addon unit already has a voucher benefit");
    }
    if (addon.unit_price_vnd <= 0) {
      throw new BundlePromotionError("BUNDLE_NO_BENEFIT", "Addon reward creates no benefit");
    }
    return {
      client_line_id: item.client_line_id,
      addon_option_id: addon.addon_option_id,
      quantity: allocation.quantity,
      discount_vnd: addon.unit_price_vnd * allocation.quantity,
    };
  });

  return {
    application_count: applicationCount,
    total_discount_vnd: rewards.reduce((sum, reward) => sum + reward.discount_vnd, 0),
    rewards,
  };
}

/** Evaluate one explicit BUNDLE selection against server-resolved cart prices and configuration. */
export function evaluateBundlePromotion(input: {
  rule: BundlePromotionRule;
  items: BundleCartItem[];
  reward_allocations: BundleRewardAllocation[];
}): BundleEvaluationResult {
  assertBaseRule(input.rule);
  assertAllocationsUnique(input.reward_allocations);
  assertMinimumOrder(input.rule, input.items, input.reward_allocations);
  return input.rule.reward_kind === "PRODUCT"
    ? getProductResult(input.rule, input.items, input.reward_allocations)
    : getAddonResult(input.rule, input.items, input.reward_allocations);
}
