export type HistoryTab = "orders" | "points";

/** Resolves a URL tab value to the supported customer-history tab. */
export function resolveHistoryTab(value: string | null): HistoryTab {
  return value === "points" ? "points" : "orders";
}

/** Returns the canonical URL for a customer-history tab. */
export function getHistoryTabHref(tab: HistoryTab): string {
  return tab === "points" ? "/history?tab=points" : "/history";
}
