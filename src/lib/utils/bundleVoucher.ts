export type BundleBenefitScaling = "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";

export interface BundleVoucherSummary {
  qr_token: string;
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: BundleBenefitScaling;
  max_applications_per_order: number;
  max_reward_units_per_order: number | null;
  eligible_menu_item_ids: string[];
  reward_menu_item_ids: string[];
}

export interface BundleCartSummaryItem {
  client_line_id: string;
  menu_item_id: string;
  quantity: number;
}

export interface BundleSelectionAllocation {
  client_line_id: string;
  quantity: number;
  addon_option_id?: string;
}

export type BundleSelectionState = {
  status: "INELIGIBLE" | "NEEDS_REWARD" | "READY" | "STALE";
  message: string;
};

/** Set or remove one explicit reward allocation without duplicating its target. */
export function setBundleAllocationQuantity(
  allocations: BundleSelectionAllocation[],
  target: Omit<BundleSelectionAllocation, "quantity">,
  quantity: number,
): BundleSelectionAllocation[] {
  const isTarget = (allocation: BundleSelectionAllocation) =>
    allocation.client_line_id === target.client_line_id &&
    allocation.addon_option_id === target.addon_option_id;
  const remaining = allocations.filter((allocation) => !isTarget(allocation));
  if (quantity < 1) return remaining;
  return [...remaining, { ...target, quantity }];
}

/** Format a short customer-facing BUNDLE benefit label. */
export function formatBundleBenefit(voucher: BundleVoucherSummary): string {
  if (voucher.reward_kind === "ADDON" && voucher.benefit_scaling === "PER_QUALIFYING_ITEM") {
    return `Mua từ ${voucher.buy_quantity} món, tặng ${voucher.reward_quantity} addon trên mỗi món`;
  }
  const rewardLabel = voucher.reward_kind === "PRODUCT" ? "món" : "addon";
  return `Mua ${voucher.buy_quantity} tặng ${voucher.reward_quantity} ${rewardLabel}`;
}

/** Derive the reusable cart state shown by customer and staff BUNDLE selectors. */
export function deriveBundleSelectionState(input: {
  voucher: BundleVoucherSummary;
  cart: BundleCartSummaryItem[];
  allocations: BundleSelectionAllocation[];
}): BundleSelectionState {
  const cartLineIds = new Set(input.cart.map((item) => item.client_line_id));
  if (input.allocations.some((allocation) => !cartLineIds.has(allocation.client_line_id))) {
    return { status: "STALE", message: "Giỏ đã thay đổi, vui lòng chọn lại quà" };
  }

  const eligibleQuantity = input.cart.reduce(
    (total, item) =>
      total + (input.voucher.eligible_menu_item_ids.includes(item.menu_item_id) ? item.quantity : 0),
    0,
  );
  const requiredCartQuantity = input.voucher.buy_quantity;
  if (eligibleQuantity < requiredCartQuantity) {
    const missing = requiredCartQuantity - eligibleQuantity;
    return { status: "INELIGIBLE", message: `Cần thêm ${missing} món đủ điều kiện` };
  }
  if (input.allocations.length === 0) {
    const rewardLabel = input.voucher.reward_kind === "PRODUCT" ? "món quà" : "addon quà";
    return {
      status: "NEEDS_REWARD",
      message: `Chọn ${input.voucher.reward_quantity} ${rewardLabel}`,
    };
  }
  const rewardTotal = input.allocations.reduce(
    (total, allocation) => total + allocation.quantity,
    0,
  );
  const exceedsUnitCap =
    input.voucher.max_reward_units_per_order !== null &&
    rewardTotal > input.voucher.max_reward_units_per_order;
  let hasExactRewardQuantity = false;
  if (input.voucher.reward_kind === "PRODUCT") {
    const applicationCount = rewardTotal / input.voucher.reward_quantity;
    const rewardFromEligibleLines = input.allocations.reduce((total, allocation) => {
      const line = input.cart.find((item) => item.client_line_id === allocation.client_line_id);
      return total +
        (line && input.voucher.eligible_menu_item_ids.includes(line.menu_item_id)
          ? allocation.quantity
          : 0);
    }, 0);
    hasExactRewardQuantity =
      Number.isInteger(applicationCount) &&
      applicationCount >= 1 &&
      applicationCount <= input.voucher.max_applications_per_order &&
      eligibleQuantity - rewardFromEligibleLines >= applicationCount * input.voucher.buy_quantity;
  } else if (input.voucher.benefit_scaling === "PER_BUNDLE") {
    const applicationCount = rewardTotal / input.voucher.reward_quantity;
    hasExactRewardQuantity =
      Number.isInteger(applicationCount) &&
      applicationCount >= 1 &&
      applicationCount <= input.voucher.max_applications_per_order &&
      eligibleQuantity >= applicationCount * input.voucher.buy_quantity;
  } else {
    const expectedRewardTotal =
      input.voucher.benefit_scaling === "PER_QUALIFYING_ITEM"
        ? eligibleQuantity * input.voucher.reward_quantity
        : input.voucher.reward_quantity;
    const cappedRewardTotal =
      input.voucher.max_reward_units_per_order === null
        ? expectedRewardTotal
        : Math.min(expectedRewardTotal, input.voucher.max_reward_units_per_order);
    hasExactRewardQuantity = rewardTotal === cappedRewardTotal;
  }
  if (!hasExactRewardQuantity || exceedsUnitCap) {
    return { status: "NEEDS_REWARD", message: "Số lượng quà đã chọn chưa đúng ưu đãi" };
  }
  return {
    status: "READY",
    message: `Đã áp dụng ${formatBundleBenefit(input.voucher).toLowerCase()}`,
  };
}
