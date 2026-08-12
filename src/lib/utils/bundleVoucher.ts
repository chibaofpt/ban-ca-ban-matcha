import type { CartItem } from "@/src/lib/types/cart";

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
  min_order_vnd: number | null;
}

export interface BundleCartAddonSummary {
  addon_option_id: string;
  quantity: number;
  unit_price_vnd: number;
  voucher_discounted_quantity: number;
}

export interface BundleCartSummaryItem {
  client_line_id: string;
  menu_item_id: string;
  label: string;
  quantity: number;
  unit_price_vnd: number;
  product_voucher_quantity: number;
  addons: BundleCartAddonSummary[];
}

export interface BundleSelectionAllocation {
  client_line_id: string;
  quantity: number;
  addon_option_id?: string;
}

export type BundleSelectionState = {
  status: "INELIGIBLE" | "NEEDS_REWARD" | "READY" | "STALE" | "CONFLICT";
  message: string;
};

/** Build the client BUNDLE projection with the same personal-voucher masks as the server. */
export function summarizeBundleCart(items: readonly CartItem[]): BundleCartSummaryItem[] {
  return items.map((item) => {
    const quantities = new Map(item.selectedOptionIds.map((id) => [id, 1]));
    item.quantityAddonOptions.forEach((addon) => quantities.set(addon.option_id, addon.quantity));
    return {
      client_line_id: item.cartId,
      menu_item_id: item.menuItemId,
      label: item.name,
      quantity: item.quantity,
      unit_price_vnd: Math.max(0, item.originalClientPriceVnd - item.addonsPrice),
      product_voucher_quantity: item.productVoucherId ? 1 : 0,
      addons: [...quantities.entries()].map(([addonOptionId, quantity]) => ({
        addon_option_id: addonOptionId,
        quantity,
        unit_price_vnd: item.addonPrices[addonOptionId] ?? 0,
        voucher_discounted_quantity: item.addonVouchers?.filter(
          (voucher) => voucher.addonOptionId === addonOptionId,
        ).length ?? 0,
      })),
    };
  });
}

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

  for (const allocation of input.allocations) {
    const line = input.cart.find((item) => item.client_line_id === allocation.client_line_id);
    if (!line) continue;
    if (!allocation.addon_option_id && allocation.quantity > line.quantity - line.product_voucher_quantity) {
      return { status: "CONFLICT", message: `${line.label} đã dùng voucher sản phẩm; vui lòng chọn phần quà khác` };
    }
    if (allocation.addon_option_id) {
      const addon = line.addons.find((item) => item.addon_option_id === allocation.addon_option_id);
      if (!addon || allocation.quantity > addon.quantity - addon.voucher_discounted_quantity) {
        return { status: "CONFLICT", message: `Addon trên ${line.label} đã dùng voucher; vui lòng chọn phần quà khác` };
      }
    }
  }

  const eligibleQuantity = input.cart.reduce(
    (total, item) =>
      total + (input.voucher.eligible_menu_item_ids.includes(item.menu_item_id)
        ? Math.max(0, item.quantity - item.product_voucher_quantity)
        : 0),
    0,
  );
  const requiredCartQuantity = input.voucher.buy_quantity;
  if (eligibleQuantity < requiredCartQuantity) {
    const missing = requiredCartQuantity - eligibleQuantity;
    const maskedLine = input.cart.find((item) =>
      item.product_voucher_quantity > 0 &&
      input.voucher.eligible_menu_item_ids.includes(item.menu_item_id),
    );
    return {
      status: "INELIGIBLE",
      message: maskedLine
        ? `${maskedLine.label} đang dùng voucher sản phẩm nên không được tính; cần thêm ${missing} món đủ điều kiện`
        : `Cần thêm ${missing} món đủ điều kiện`,
    };
  }
  const eligibleSubtotal = input.cart.reduce((total, item) => {
    const drinkTotal = Math.max(0, item.quantity - item.product_voucher_quantity) * item.unit_price_vnd;
    const addonTotal = item.addons.reduce(
      (sum, addon) => sum + Math.max(0, addon.quantity - addon.voucher_discounted_quantity) * addon.unit_price_vnd,
      0,
    );
    return total + drinkTotal + addonTotal;
  }, 0);
  if (input.voucher.min_order_vnd !== null && eligibleSubtotal < input.voucher.min_order_vnd) {
    const missing = input.voucher.min_order_vnd - eligibleSubtotal;
    return {
      status: "INELIGIBLE",
      message: `Cần thêm ${missing.toLocaleString("vi-VN")}đ sản phẩm hợp lệ để đạt giá trị đơn tối thiểu`,
    };
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
        ? Math.min(
            eligibleQuantity,
            input.voucher.buy_quantity * input.voucher.max_applications_per_order,
          ) * input.voucher.reward_quantity
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
