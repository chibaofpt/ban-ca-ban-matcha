import type { CartItem } from "@/src/lib/types/cart";

/** Sums all cart units that refer to one menu item. */
export function getMenuItemCartQuantity(items: CartItem[], menuItemId: string): number {
  return items.reduce(
    (total, item) => total + (item.menuItemId === menuItemId ? item.quantity : 0),
    0,
  );
}

/** Derives checkout points without including shipping in the order-points base. */
export function deriveCheckoutRewards(
  items: CartItem[],
  merchandiseAfterDiscountVnd: number,
  productVoucherCoveredPrices: Readonly<Record<string, number>>,
): {
  orderPoints: number;
  surplusVnd: number;
  surplusPoints: number;
  totalPoints: number;
} {
  const surplusVnd = items.reduce((total, item) => {
    if (!item.productVoucherId) return total;
    const coveredPriceVnd = productVoucherCoveredPrices[item.productVoucherId] ?? 0;
    const drinkPriceVnd = Math.max(0, item.originalClientPriceVnd - item.addonsPrice);
    return total + Math.max(0, coveredPriceVnd - drinkPriceVnd);
  }, 0);

  const orderPoints = Math.floor(Math.max(0, merchandiseAfterDiscountVnd) / 10_000);
  const surplusPoints = Math.floor(surplusVnd / 10_000);

  return {
    orderPoints,
    surplusVnd,
    surplusPoints,
    totalPoints: orderPoints + surplusPoints,
  };
}
