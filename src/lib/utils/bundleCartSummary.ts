import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { bundleProductUnitUsage } from "@/src/utils/bundlePromotion";

export interface BundleCartDisplayTotals {
  grossVnd: number;
  discountVnd: number;
  netVnd: number;
  paidToppingsVnd: number;
}

function bundleRewardKind(allocations: readonly BundleSelectionAllocation[]): "PRODUCT" | "ADDON" {
  return allocations.some((allocation) => allocation.addon_option_id !== undefined) ? "ADDON" : "PRODUCT";
}

/** Return product units reserved by BUNDLE applications, leaving outside units available. */
export function getBundleAllocatedQuantities(
  applications: readonly CartBundleApplication[],
): ReadonlyMap<string, number> {
  const quantities = new Map<string, number>();
  for (const application of applications) {
    const usage = bundleProductUnitUsage(
      { reward_kind: bundleRewardKind(application.reward_allocations) },
      application.qualifier_allocations,
      application.reward_allocations,
    );
    for (const [lineId, quantity] of usage) {
      quantities.set(lineId, (quantities.get(lineId) ?? 0) + quantity);
    }
  }
  return quantities;
}

/** Return units on a cart row that remain available for a personal voucher. */
export function getBundleOutsideQuantity(
  item: Pick<CartItem, "cartId" | "quantity">,
  allocatedQuantities: ReadonlyMap<string, number>,
): number {
  return Math.max(0, item.quantity - (allocatedQuantities.get(item.cartId) ?? 0));
}

/** Return selected addon units that remain available for a personal voucher. */
export function getBundleOutsideAddonQuantity(
  lineKey: string,
  selectedQuantity: number,
  allocatedQuantities: ReadonlyMap<string, number>,
): number {
  return Math.max(0, selectedQuantity - (allocatedQuantities.get(lineKey) ?? 0));
}

/** Calculate one BUNDLE block from allocated units while keeping paid addons separate. */
export function getBundleCartDisplayTotals(
  items: CartItem[],
  allocations: BundleSelectionAllocation[],
  discountVnd: number,
): BundleCartDisplayTotals {
  const productAllocations = allocations.filter((allocation) => !allocation.addon_option_id);
  const addonAllocations = allocations.filter((allocation) => allocation.addon_option_id);
  const quantityByLine = bundleProductUnitUsage(
    { reward_kind: bundleRewardKind(addonAllocations) },
    productAllocations,
    addonAllocations,
  );
  const freeAddonPriceByLine = new Map<string, number>();
  for (const allocation of allocations) {
    if (allocation.addon_option_id) {
      const item = items.find((candidate) => candidate.cartId === allocation.client_line_id);
      const addonPrice = item?.addonPrices[allocation.addon_option_id] ?? 0;
      freeAddonPriceByLine.set(
        allocation.client_line_id,
        (freeAddonPriceByLine.get(allocation.client_line_id) ?? 0) + addonPrice * allocation.quantity,
      );
      continue;
    }
  }
  let grossVnd = 0;
  let paidToppingsVnd = 0;
  for (const item of items) {
    const quantity = Math.min(item.quantity, quantityByLine.get(item.cartId) ?? 0);
    grossVnd += item.originalClientPriceVnd * quantity;
    paidToppingsVnd += Math.max(0, item.addonsPrice * quantity - (freeAddonPriceByLine.get(item.cartId) ?? 0));
  }
  const appliedDiscountVnd = Math.min(grossVnd, Math.max(0, discountVnd));
  return {
    grossVnd,
    discountVnd: appliedDiscountVnd,
    netVnd: grossVnd - appliedDiscountVnd,
    paidToppingsVnd,
  };
}
