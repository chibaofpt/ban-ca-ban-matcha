import type { CartItem } from "@/src/lib/types/cart";
import type { Size } from "@/src/lib/types/menu";

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
  eligible_products: BundleVoucherProductSummary[];
  reward_products: BundleVoucherProductSummary[];
  min_order_vnd: number | null;
}

export interface BundleVoucherProductSummary {
  menu_item_id: string;
  allowed_sizes: Size[];
  baseline_prices_vnd?: Partial<Record<Size, number>>;
  baseline_price_vnd?: number;
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
  size: Size | null;
  label: string;
  quantity: number;
  unit_price_vnd: number;
  product_voucher_quantity: number;
  product_discount_voucher_quantity?: number;
  product_discount_vnd?: number;
  addons: BundleCartAddonSummary[];
}

export interface BundleSelectionAllocation {
  client_line_id: string;
  quantity: number;
  addon_option_id?: string;
}

export interface BundleApplicationPayload {
  voucher_qr_token: string;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
}

export interface BundleAllocationConstraintApplication {
  voucher_qr_token: string;
  voucher: BundleVoucherSummary;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
}

export interface BundleAllocationConstraints {
  allowed_sizes_by_line: Map<string, Size[]>;
  non_editable_line_ids: Set<string>;
  error_by_token: Map<string, string>;
}

export type BundleSelectionState = {
  status: "INELIGIBLE" | "NEEDS_REWARD" | "READY" | "STALE" | "CONFLICT";
  message: string;
};

/** Build the client BUNDLE projection with the same personal-voucher masks as the server. */
export function summarizeBundleCart(items: readonly CartItem[]): BundleCartSummaryItem[] {
  return items.map((item) => {
    const quantities = new Map(item.selectedOptionIds.map((id) => [id, 1]));
    return {
      client_line_id: item.cartId,
      menu_item_id: item.menuItemId,
      size: item.size,
      label: item.name,
      quantity: item.quantity,
      unit_price_vnd: Math.max(0, item.originalClientPriceVnd - item.addonsPrice),
      product_voucher_quantity: item.itemVoucherId || (item.productVoucherId && item.productVoucherType !== "PRODUCT_DISCOUNT") ? 1 : 0,
      product_discount_voucher_quantity: item.productVoucherId && item.productVoucherType === "PRODUCT_DISCOUNT" && (item.productVoucherDiscountVnd ?? 0) > 0 ? 1 : 0,
      product_discount_vnd: item.productVoucherType === "PRODUCT_DISCOUNT" ? item.productVoucherDiscountVnd ?? 0 : 0,
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

function productMatchesSummary(item: Pick<BundleCartSummaryItem, "menu_item_id" | "size">, product: BundleVoucherProductSummary): boolean {
  return item.menu_item_id === product.menu_item_id && (item.size === null ? product.allowed_sizes.length === 0 : product.allowed_sizes.includes(item.size));
}

function isEligibleProduct(item: BundleCartSummaryItem, voucher: BundleVoucherSummary): boolean {
  return voucher.eligible_products.some((product) => productMatchesSummary(item, product));
}

/** Intersect every BUNDLE role scope assigned to a cart line before it can be edited. */
export function deriveBundleAllocationConstraints(input: {
  cart: BundleCartSummaryItem[];
  applications: BundleAllocationConstraintApplication[];
}): BundleAllocationConstraints {
  const constraintsByLine = new Map<string, Array<{ token: string; allowedSizes: Size[] }>>();
  const error_by_token = new Map<string, string>();
  const invalidLineIds = new Set<string>();
  const lineById = new Map(input.cart.map((line) => [line.client_line_id, line]));
  for (const application of input.applications) {
    const addConstraints = (allocations: BundleSelectionAllocation[], role: "QUALIFIER" | "REWARD") => {
      const scopes = role === "QUALIFIER" || application.voucher.reward_mode === "SAME_CONFIG"
        ? application.voucher.eligible_products
        : application.voucher.reward_products;
      for (const allocation of allocations) {
        if (allocation.addon_option_id) continue;
        const line = lineById.get(allocation.client_line_id);
        const scope = line ? scopes.find((product) => productMatchesSummary(line, product)) : undefined;
        if (!line || !scope) {
          error_by_token.set(application.voucher_qr_token, "Món BUNDLE đã thay đổi ngoài phạm vi ưu đãi");
          if (line) invalidLineIds.add(line.client_line_id);
          continue;
        }
        if (line.size === null) continue;
        const constraints = constraintsByLine.get(line.client_line_id) ?? [];
        constraints.push({ token: application.voucher_qr_token, allowedSizes: scope.allowed_sizes });
        constraintsByLine.set(line.client_line_id, constraints);
      }
    };
    addConstraints(application.qualifier_allocations, "QUALIFIER");
    addConstraints(application.reward_allocations, "REWARD");
  }
  const allowed_sizes_by_line = new Map<string, Size[]>();
  const non_editable_line_ids = new Set(invalidLineIds);
  for (const [lineId, constraints] of constraintsByLine) {
    const intersection = constraints[0]?.allowedSizes.filter((size) => constraints.every((entry) => entry.allowedSizes.includes(size))) ?? [];
    if (intersection.length === 0) {
      non_editable_line_ids.add(lineId);
      for (const constraint of constraints) {
        error_by_token.set(constraint.token, "Các ưu đãi BUNDLE trên cùng món không có size chung; vui lòng chọn lại ưu đãi");
      }
    } else {
      allowed_sizes_by_line.set(lineId, intersection);
    }
  }
  return { allowed_sizes_by_line, non_editable_line_ids, error_by_token };
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
    if (!allocation.addon_option_id && allocation.quantity > line.quantity - line.product_voucher_quantity - (line.product_discount_voucher_quantity ?? 0)) {
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
      total + (isEligibleProduct(item, input.voucher)
        ? Math.max(0, item.quantity - item.product_voucher_quantity)
        : 0),
    0,
  );
  const requiredCartQuantity = input.voucher.buy_quantity;
  if (eligibleQuantity < requiredCartQuantity) {
    const missing = requiredCartQuantity - eligibleQuantity;
    const maskedLine = input.cart.find((item) =>
      item.product_voucher_quantity > 0 &&
      isEligibleProduct(item, input.voucher),
    );
    return {
      status: "INELIGIBLE",
      message: maskedLine
        ? `${maskedLine.label} đang dùng voucher sản phẩm nên không được tính; cần thêm ${missing} món đủ điều kiện`
        : `Cần thêm ${missing} món đủ điều kiện`,
    };
  }
  const eligibleSubtotal = input.cart.reduce((total, item) => {
    const drinkTotal = Math.max(0, Math.max(0, item.quantity - item.product_voucher_quantity) * item.unit_price_vnd - (item.product_discount_vnd ?? 0));
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
        (line && isEligibleProduct(line, input.voucher)
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

/** Build explicit qualifier pools for one selected BUNDLE without reusing masked or reward units. */
export function buildBundleApplication(input: {
  voucher: BundleVoucherSummary;
  cart: BundleCartSummaryItem[];
  rewardAllocations: BundleSelectionAllocation[];
}): BundleApplicationPayload | null {
  const rewardTotal = input.rewardAllocations.reduce(
    (sum, allocation) => sum + allocation.quantity,
    0,
  );
  let qualifierQuantity: number;
  if (input.voucher.reward_kind === "ADDON" && input.voucher.benefit_scaling === "ONCE_PER_ORDER") {
    qualifierQuantity = input.voucher.buy_quantity;
  } else if (
    input.voucher.reward_kind === "ADDON" &&
    input.voucher.benefit_scaling === "PER_QUALIFYING_ITEM"
  ) {
    const eligibleQuantity = input.cart.reduce(
      (sum, line) => sum + (isEligibleProduct(line, input.voucher)
        ? Math.max(0, line.quantity - line.product_voucher_quantity)
        : 0),
      0,
    );
    qualifierQuantity = Math.min(
      eligibleQuantity,
      input.voucher.buy_quantity * input.voucher.max_applications_per_order,
    );
  } else {
    const applicationCount = rewardTotal / input.voucher.reward_quantity;
    if (!Number.isInteger(applicationCount) || applicationCount < 1) return null;
    qualifierQuantity = applicationCount * input.voucher.buy_quantity;
  }

  const productRewardsByLine = new Map<string, number>();
  if (input.voucher.reward_kind === "PRODUCT") {
    for (const allocation of input.rewardAllocations) {
      productRewardsByLine.set(
        allocation.client_line_id,
        (productRewardsByLine.get(allocation.client_line_id) ?? 0) + allocation.quantity,
      );
    }
  }
  const qualifierAllocations: BundleSelectionAllocation[] = [];
  let remaining = qualifierQuantity;
  for (const line of input.cart) {
    if (!isEligibleProduct(line, input.voucher)) continue;
    const available = Math.max(
      0,
      line.quantity - line.product_voucher_quantity -
        (productRewardsByLine.get(line.client_line_id) ?? 0),
    );
    const quantity = Math.min(available, remaining);
    if (quantity > 0) {
      qualifierAllocations.push({ client_line_id: line.client_line_id, quantity });
      remaining -= quantity;
    }
    if (remaining === 0) break;
  }
  if (remaining > 0) return null;
  return {
    voucher_qr_token: input.voucher.qr_token,
    qualifier_allocations: qualifierAllocations,
    reward_allocations: input.rewardAllocations,
  };
}
