import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { Size } from "@/src/lib/types/menu";
import {
  bundleAvailableProductQuantity,
  type BundleCartItem,
  type BundlePromotionRule,
} from "@/src/utils/bundlePromotion";
import { autofillBundleSelection, planBundleSelection } from "@/src/utils/bundleSelection";

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
  reward_addon_option_ids: string[];
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
  addon_group_id?: string;
  max_select?: number;
  quantity: number;
  unit_price_vnd: number;
  gram_value: number | null;
  is_active: boolean;
  is_deleted: boolean;
  is_dynamic_gram: boolean;
  voucher_discounted_quantity: number;
  personal_voucher_quantity?: number;
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
  personal_voucher_quantity?: number;
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
  application?: BundleApplicationPayload;
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
      product_discount_voucher_quantity: item.productVoucherId && item.productVoucherType === "PRODUCT_DISCOUNT" ? 1 : 0,
      product_discount_vnd: item.productVoucherType === "PRODUCT_DISCOUNT" ? item.productVoucherDiscountVnd ?? 0 : 0,
      personal_voucher_quantity: Math.min(item.quantity, Math.max(
        item.productVoucherId ? 1 : 0,
        item.itemVoucherId ? 1 : 0,
        item.addonVouchers && item.addonVouchers.length > 0 ? 1 : 0,
      )),
      addons: [...quantities.entries()].map(([addonOptionId, quantity]) => ({
        addon_option_id: addonOptionId,
        ...(item.addonMetadata?.[addonOptionId]?.addon_group_id
          ? { addon_group_id: item.addonMetadata[addonOptionId].addon_group_id }
          : {}),
        ...(item.addonMetadata?.[addonOptionId]?.max_select === undefined
          ? {}
          : { max_select: item.addonMetadata[addonOptionId].max_select }),
        quantity: quantity * item.quantity,
        unit_price_vnd: item.addonPrices[addonOptionId] ?? 0,
        gram_value: item.addonMetadata?.[addonOptionId]?.gram_value ?? null,
        is_active: item.addonMetadata?.[addonOptionId]?.is_active ?? true,
        is_deleted: item.addonMetadata?.[addonOptionId]?.is_deleted ?? false,
        is_dynamic_gram: item.addonMetadata?.[addonOptionId]?.is_dynamic_gram ?? false,
        voucher_discounted_quantity: item.addonVouchers?.filter(
          (voucher) => voucher.addonOptionId === addonOptionId,
        ).length ?? 0,
        personal_voucher_quantity: item.addonVouchers?.filter(
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

/** A persisted sibling BUNDLE resolved to its current wallet rule summary. */
export interface BundleSelectionSiblingApplication {
  voucher_qr_token: string;
  voucher: BundleVoucherSummary;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
}

/** Resolve persisted sibling applications before validating a candidate draft. */
export function resolveBundleSelectionSiblings(input: {
  current_qr_token: string;
  applications: readonly Pick<CartBundleApplication, "voucher_qr_token" | "qualifier_allocations" | "reward_allocations">[];
  summaries: readonly BundleVoucherSummary[];
}): { ok: true; siblings: BundleSelectionSiblingApplication[] } | { ok: false; error: string } {
  const summaries = new Map(input.summaries.map((summary) => [summary.qr_token, summary]));
  const siblings: BundleSelectionSiblingApplication[] = [];
  for (const application of input.applications) {
    if (application.voucher_qr_token === input.current_qr_token) continue;
    const voucher = summaries.get(application.voucher_qr_token);
    if (!voucher) return { ok: false, error: "Một ưu đãi BUNDLE khác chưa thể kiểm tra lại; vui lòng làm mới ví rồi thử lại" };
    siblings.push({ voucher_qr_token: application.voucher_qr_token, voucher, qualifier_allocations: application.qualifier_allocations, reward_allocations: application.reward_allocations });
  }
  return { ok: true, siblings };
}

function toPromotionRule(voucher: BundleVoucherSummary, selectedAddonIds: readonly string[] = []): BundlePromotionRule {
  const products = (scopes: BundleVoucherProductSummary[]) => scopes.map((product) => ({
    menu_item_id: product.menu_item_id,
    allowed_sizes: product.allowed_sizes,
    default_powder_id: null,
    default_base_liquid_id: null,
    baseline_prices_vnd: product.baseline_prices_vnd ?? {},
    ...(product.baseline_price_vnd === undefined ? {} : { baseline_price_vnd: product.baseline_price_vnd }),
  }));
  return {
    min_order_vnd: voucher.min_order_vnd,
    buy_quantity: voucher.buy_quantity,
    reward_quantity: voucher.reward_quantity,
    reward_kind: voucher.reward_kind,
    reward_mode: voucher.reward_mode,
    benefit_scaling: voucher.benefit_scaling,
    max_applications_per_order: voucher.max_applications_per_order,
    max_reward_units_per_order: voucher.max_reward_units_per_order,
    qualifier_products: products(voucher.eligible_products),
    reward_products: products(voucher.reward_products),
    reward_addon_option_ids: [...new Set(selectedAddonIds)],
  };
}

function toPromotionItem(item: BundleCartSummaryItem): BundleCartItem {
  return {
    client_line_id: item.client_line_id,
    menu_item_id: item.menu_item_id,
    size: item.size,
    selected_powder_id: null,
    selected_milk_type_id: null,
    unit_price_vnd: item.unit_price_vnd,
    quantity: item.quantity,
    product_voucher_quantity: item.product_voucher_quantity,
    product_discount_voucher_quantity: item.product_discount_voucher_quantity,
    product_discount_vnd: item.product_discount_vnd,
    personal_voucher_quantity: item.personal_voucher_quantity,
    addons: item.addons.map((addon) => ({
      addon_option_id: addon.addon_option_id,
      ...(addon.addon_group_id ? { addon_group_id: addon.addon_group_id } : {}),
      ...(addon.max_select === undefined ? {} : { max_select: addon.max_select }),
      quantity: addon.quantity,
      unit_price_vnd: addon.unit_price_vnd,
      gram_value: addon.gram_value,
      voucher_discounted_quantity: addon.voucher_discounted_quantity,
      personal_voucher_quantity: addon.personal_voucher_quantity,
      is_active: addon.is_active,
      is_deleted: addon.is_deleted,
      is_dynamic_gram: addon.is_dynamic_gram,
    })),
  };
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
  qualifierAllocations?: BundleSelectionAllocation[];
  siblingApplications?: readonly BundleSelectionSiblingApplication[];
}): BundleSelectionState {
  const cartLineIds = new Set(input.cart.map((item) => item.client_line_id));
  if (input.allocations.some((allocation) => !cartLineIds.has(allocation.client_line_id))) {
    return { status: "STALE", message: "Giỏ đã thay đổi, vui lòng chọn lại quà" };
  }

  for (const allocation of input.allocations) {
    const line = input.cart.find((item) => item.client_line_id === allocation.client_line_id);
    if (!line) continue;
    if (!allocation.addon_option_id && allocation.quantity > bundleAvailableProductQuantity(line)) {
      return { status: "CONFLICT", message: `${line.label} đã dùng voucher sản phẩm; vui lòng chọn phần quà khác` };
    }
    if (allocation.addon_option_id) {
      const addon = line.addons.find((item) => item.addon_option_id === allocation.addon_option_id);
      const personalQuantity = addon?.personal_voucher_quantity ?? addon?.voucher_discounted_quantity ?? 0;
      if (!addon || allocation.quantity > addon.quantity - personalQuantity) {
        return { status: "CONFLICT", message: `Addon trên ${line.label} đã dùng voucher; vui lòng chọn phần quà khác` };
      }
    }
  }

  const productRewardsByLine = new Map<string, number>();
  for (const allocation of input.allocations) {
    if (!allocation.addon_option_id) {
      productRewardsByLine.set(
        allocation.client_line_id,
        (productRewardsByLine.get(allocation.client_line_id) ?? 0) + allocation.quantity,
      );
    }
  }
  const eligibleQuantity = input.cart.reduce(
    (total, item) =>
      total + (isEligibleProduct(item, input.voucher)
        ? Math.max(0, bundleAvailableProductQuantity(item) - (productRewardsByLine.get(item.client_line_id) ?? 0))
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
    const drinkTotal = Math.max(0, Math.max(0, item.quantity - item.product_voucher_quantity - (productRewardsByLine.get(item.client_line_id) ?? 0)) * item.unit_price_vnd - (item.product_discount_vnd ?? 0));
    const addonTotal = item.addons.reduce(
      (sum, addon) => {
        const rewardQuantity = input.allocations
          .filter((allocation) => allocation.addon_option_id === addon.addon_option_id && allocation.client_line_id === item.client_line_id)
          .reduce((quantity, allocation) => quantity + allocation.quantity, 0);
        const personalQuantity = addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity;
        return sum + Math.max(0, addon.quantity - personalQuantity - rewardQuantity) * addon.unit_price_vnd;
      },
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
  const application = buildBundleApplication({ voucher: input.voucher, cart: input.cart, rewardAllocations: input.allocations, qualifierAllocations: input.qualifierAllocations });
  if (!application) return { status: "NEEDS_REWARD", message: "Không đủ món sạch để hoàn tất quà" };
  const selectedAddonIds = input.allocations.flatMap((allocation) => allocation.addon_option_id ? [allocation.addon_option_id] : []);
  const siblingApplications = (input.siblingApplications ?? []).filter((sibling) => sibling.voucher_qr_token !== input.voucher.qr_token).map((sibling) => ({
    voucher_qr_token: sibling.voucher_qr_token,
    rule: toPromotionRule(sibling.voucher, sibling.reward_allocations.flatMap((allocation) => allocation.addon_option_id ? [allocation.addon_option_id] : [])),
    qualifier_allocations: sibling.qualifier_allocations,
    reward_allocations: sibling.reward_allocations,
  }));
  const plan = planBundleSelection({
    items: input.cart.map(toPromotionItem),
    voucher_qr_token: input.voucher.qr_token,
    rule: toPromotionRule(input.voucher, selectedAddonIds),
    qualifier_allocations: application.qualifier_allocations,
    reward_allocations: application.reward_allocations,
    sibling_applications: siblingApplications,
  });
  if (plan.status === "READY") return { status: "READY", message: `Đã áp dụng ${formatBundleBenefit(input.voucher).toLowerCase()}`, application };
  if (plan.status === "INELIGIBLE") return { status: "INELIGIBLE", message: plan.reason?.message ?? "Giá trị sản phẩm hợp lệ chưa đủ mức tối thiểu" };
  if (plan.status === "INCOMPLETE") return { status: "NEEDS_REWARD", message: "Số lượng quà đã chọn chưa đúng ưu đãi" };
  return { status: "CONFLICT", message: plan.reason?.message ?? "Không thể kiểm tra ưu đãi BUNDLE" };
}

/** Build explicit qualifier pools for one selected BUNDLE without reusing masked or reward units. */
export function buildBundleApplication(input: {
  voucher: BundleVoucherSummary;
  cart: BundleCartSummaryItem[];
  rewardAllocations: BundleSelectionAllocation[];
  qualifierAllocations?: BundleSelectionAllocation[];
}): BundleApplicationPayload | null {
  if (input.rewardAllocations.length === 0) return null;
  const selectedAddonIds = input.rewardAllocations.flatMap((allocation) => allocation.addon_option_id ? [allocation.addon_option_id] : []);
  const application = autofillBundleSelection({
    items: input.cart.map(toPromotionItem),
    voucher_qr_token: input.voucher.qr_token,
    rule: toPromotionRule(input.voucher, selectedAddonIds),
    qualifier_allocations: input.qualifierAllocations?.filter((allocation) => !allocation.addon_option_id),
    reward_allocations: input.rewardAllocations,
  });
  return {
    voucher_qr_token: application.voucher_qr_token,
    qualifier_allocations: application.qualifier_allocations,
    reward_allocations: application.reward_allocations,
  };
}
