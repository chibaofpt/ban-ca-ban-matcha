import {
  BundlePromotionError,
  bundleProductUnitUsage,
  evaluateBundlePromotion,
  bundleAvailableProductQuantity,
  bundlePersonalVoucherQuantity,
  type BundleCartItem,
  type BundleEvaluationResult,
  type BundlePromotionRule,
  type BundleQualifierAllocation,
  type BundleRewardAllocation,
} from "@/src/utils/bundlePromotion";

export interface BundleApplicationEvaluationInput {
  voucher_qr_token: string;
  rule: BundlePromotionRule;
  qualifier_allocations: BundleQualifierAllocation[];
  reward_allocations: BundleRewardAllocation[];
}

export interface BundleApplicationsEvaluationResult {
  evaluations: Array<{ voucher_qr_token: string; evaluation: BundleEvaluationResult }>;
  total_discount_vnd: number;
  line_discounts_vnd: Map<string, number>;
}

function availableProducts(item: BundleCartItem | undefined): number {
  return item ? bundleAvailableProductQuantity(item) : 0;
}

type BundleApplicationCapacityInput = Pick<BundleApplicationEvaluationInput, "voucher_qr_token" | "qualifier_allocations" | "reward_allocations"> & {
  rule?: Pick<BundlePromotionRule, "reward_kind">;
};

function assertGlobalCapacity(applications: BundleApplicationCapacityInput[], items: BundleCartItem[]): void {
  const itemByLine = new Map(items.map((item) => [item.client_line_id, item]));
  const tokens = new Set<string>();
  const productUsage = new Map<string, number>();
  const addonUsage = new Map<string, number>();
  for (const application of applications) {
    if (tokens.has(application.voucher_qr_token)) throw new BundlePromotionError("BUNDLE_DUPLICATE_VOUCHER", "Bundle token can appear only once");
    tokens.add(application.voucher_qr_token);
    const rewardKind = application.rule?.reward_kind ?? (application.reward_allocations.some((allocation) => allocation.addon_option_id) ? "ADDON" : "PRODUCT");
    const ownProductUsage = bundleProductUnitUsage({ reward_kind: rewardKind }, application.qualifier_allocations, application.reward_allocations);
    for (const [lineId, quantity] of ownProductUsage) {
      const item = itemByLine.get(lineId);
      if (!item) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Allocation line is missing");
      if (quantity > availableProducts(item)) {
        const personal = bundlePersonalVoucherQuantity(item);
        throw new BundlePromotionError(personal > 0 ? "BUNDLE_CONFLICT" : "BUNDLE_ALLOCATION_OVERLAP", personal > 0 ? "Bundle allocation overlaps a personal voucher" : "Product unit is allocated more than once");
      }
      productUsage.set(lineId, (productUsage.get(lineId) ?? 0) + quantity);
    }
    const ownAddonUsage = new Map<string, number>();
    for (const allocation of application.reward_allocations) {
      if (allocation.addon_option_id) {
        const key = `${allocation.client_line_id}:${allocation.addon_option_id}`;
        ownAddonUsage.set(key, (ownAddonUsage.get(key) ?? 0) + allocation.quantity);
        addonUsage.set(key, (addonUsage.get(key) ?? 0) + allocation.quantity);
      }
    }
    for (const [key, quantity] of ownAddonUsage) {
      const splitAt = key.lastIndexOf(":");
      const addon = itemByLine.get(key.slice(0, splitAt))?.addons.find((candidate) => candidate.addon_option_id === key.slice(splitAt + 1));
      const personalQuantity = addon ? Math.max(0, addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity ?? 0) : 0;
      if (!addon) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Addon allocation is outside the cart scope");
      if (quantity + personalQuantity > addon.quantity) throw new BundlePromotionError(personalQuantity > 0 ? "BUNDLE_CONFLICT" : "BUNDLE_ALLOCATION_OVERLAP", personalQuantity > 0 ? "Addon allocation overlaps a personal voucher" : "Addon unit is allocated more than once");
    }
  }
  for (const [lineId, quantity] of productUsage) {
    const item = itemByLine.get(lineId);
    if (!item) throw new BundlePromotionError("BUNDLE_SCOPE_MISMATCH", "Allocation line is missing");
    if (quantity <= availableProducts(item)) continue;
    throw new BundlePromotionError("BUNDLE_ALLOCATION_OVERLAP", "Product unit is allocated more than once");
  }
  for (const [key, quantity] of addonUsage) {
    const splitAt = key.lastIndexOf(":");
    const addon = itemByLine.get(key.slice(0, splitAt))?.addons.find((candidate) => candidate.addon_option_id === key.slice(splitAt + 1));
    const personalQuantity = addon ? Math.max(0, addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity ?? 0) : 0;
    if (!addon || quantity + personalQuantity > addon.quantity) {
      throw new BundlePromotionError(
        !addon ? "BUNDLE_SCOPE_MISMATCH" : "BUNDLE_ALLOCATION_OVERLAP",
        !addon ? "Addon allocation is outside the cart scope" : "Addon unit is allocated more than once",
      );
    }
  }
}

/** Validate cross-voucher allocation capacity before fetching voucher records. */
export function assertBundleApplicationCapacity(input: {
  items: BundleCartItem[];
  applications: Array<Pick<BundleApplicationEvaluationInput, "voucher_qr_token" | "qualifier_allocations" | "reward_allocations">>;
}): void {
  assertGlobalCapacity(input.applications, input.items);
}

function globalPaidSubtotal(applications: BundleApplicationEvaluationInput[], items: BundleCartItem[]): number {
  const productRewards = new Map<string, number>();
  const addonRewards = new Map<string, number>();
  for (const application of applications) for (const reward of application.reward_allocations) {
    const key = `${reward.client_line_id}:${reward.addon_option_id ?? "PRODUCT"}`;
    const target = reward.addon_option_id ? addonRewards : productRewards;
    target.set(key, (target.get(key) ?? 0) + reward.quantity);
  }
  return items.reduce((total, item) => {
    const paidProducts = Math.max(0, item.quantity - item.product_voucher_quantity - (item.item_voucher_quantity ?? 0));
    const products = Math.max(0, paidProducts - (productRewards.get(`${item.client_line_id}:PRODUCT`) ?? 0));
    const addons = item.addons.reduce((sum, addon) => {
      const personalQuantity = Math.max(0, addon.personal_voucher_quantity ?? addon.voucher_discounted_quantity ?? 0);
      return sum + Math.max(0, addon.quantity - personalQuantity - (addonRewards.get(`${item.client_line_id}:${addon.addon_option_id}`) ?? 0)) * addon.unit_price_vnd;
    }, 0);
    return total + Math.max(0, products * item.unit_price_vnd - (item.product_discount_vnd ?? 0)) + addons;
  }, 0);
}

/** Evaluate distinct BUNDLE instances using one global non-overlapping allocation pool. */
export function evaluateBundleApplications(input: { items: BundleCartItem[]; applications: BundleApplicationEvaluationInput[] }): BundleApplicationsEvaluationResult {
  assertGlobalCapacity(input.applications, input.items);
  const paid_merchandise_subtotal_vnd = globalPaidSubtotal(input.applications, input.items);
  const evaluations = input.applications.map((application) => ({
    voucher_qr_token: application.voucher_qr_token,
    evaluation: evaluateBundlePromotion({ ...application, items: input.items, paid_merchandise_subtotal_vnd }),
  }));
  const line_discounts_vnd = new Map<string, number>();
  for (const { evaluation } of evaluations) for (const reward of evaluation.rewards) {
    line_discounts_vnd.set(reward.client_line_id, (line_discounts_vnd.get(reward.client_line_id) ?? 0) + reward.discount_vnd);
  }
  return { evaluations, line_discounts_vnd, total_discount_vnd: evaluations.reduce((sum, item) => sum + item.evaluation.total_discount_vnd, 0) };
}
