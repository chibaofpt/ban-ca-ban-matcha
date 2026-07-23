import type { CartItem } from "@/src/lib/types/cart";

export interface PointsLogEntry {
  id: string;
  delta: number;
  reason: string;
  order_id: string | null;
  voucher_id: string | null;
  created_at: string;
}

export interface PointsHistoryGroup {
  id: string;
  kind: "order_reward" | "order_reversal" | "other";
  orderId: string | null;
  orderPoints: number;
  surplusPoints: number;
  totalDelta: number;
  createdAt: string;
  logs: PointsLogEntry[];
}

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

function getPointsGroupKind(reason: string): PointsHistoryGroup["kind"] {
  if (reason === "order_complete" || reason === "voucher_surplus") return "order_reward";
  if (reason === "order_complete_reversed" || reason === "voucher_surplus_reversed") {
    return "order_reversal";
  }
  return "other";
}

/** Groups order and surplus point logs while keeping reversals as separate events. */
export function groupPointsLogs(logs: PointsLogEntry[]): PointsHistoryGroup[] {
  const groups = new Map<string, PointsHistoryGroup>();

  for (const log of logs) {
    const kind = getPointsGroupKind(log.reason);
    const canGroup = kind !== "other" && log.order_id !== null;
    const key = canGroup ? `${kind}:${log.order_id}` : `log:${log.id}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id: key,
        kind,
        orderId: log.order_id,
        orderPoints:
          log.reason === "order_complete" || log.reason === "order_complete_reversed"
            ? log.delta
            : 0,
        surplusPoints:
          log.reason === "voucher_surplus" || log.reason === "voucher_surplus_reversed"
            ? log.delta
            : 0,
        totalDelta: log.delta,
        createdAt: log.created_at,
        logs: [log],
      });
      continue;
    }

    existing.logs.push(log);
    existing.totalDelta += log.delta;
    if (log.reason === "order_complete" || log.reason === "order_complete_reversed") {
      existing.orderPoints += log.delta;
    }
    if (log.reason === "voucher_surplus" || log.reason === "voucher_surplus_reversed") {
      existing.surplusPoints += log.delta;
    }
    if (new Date(log.created_at).getTime() > new Date(existing.createdAt).getTime()) {
      existing.createdAt = log.created_at;
    }
  }

  return [...groups.values()].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
