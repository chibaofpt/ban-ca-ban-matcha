import type {
  AddonPowderBreakdown,
  AddonUsage,
  AdminReport,
  DailyReport,
  RevenueByType,
  TopProduct,
} from "@/contracts/report";
import {
  buildReport,
  type DailyReportResult,
  type DefaultSizeEntry,
  type MilkConfig,
  type PowderConfig,
  type PowderSizeEntry,
  type RawOrder,
  type RawOrderItem,
} from "@/lib/reports/reportAggregation";

// ---------------------------------------------------------------------------
// RawAdminOrder — extends RawOrder with order_type
// ---------------------------------------------------------------------------

/** Order item addon for admin report (includes label + group) */
export interface RawAdminAddonItem {
  addon_option_id: string;
  quantity: number;
  unit_price_vnd: number;
  addonOption: {
    label: string;
    group: { name: string } | null;
    gram_value: number | null;
  };
}

/** Extended order item for admin report */
export interface RawAdminOrderItem
  extends Omit<RawOrderItem, "addons"> {
  addons: RawAdminAddonItem[];
}

/** Extended order for admin report — includes order_type */
export interface RawAdminOrder extends Omit<RawOrder, "items"> {
  order_type: "COUNTER" | "PICKUP" | "DELIVERY";
  items: RawAdminOrderItem[];
}

// ---------------------------------------------------------------------------
// AddonUsage / RevenueByType / TopProduct output types
// ---------------------------------------------------------------------------

export type AddonUsageResult = AddonUsage;
export type AddonPowderBreakdownResult = AddonPowderBreakdown;
export type RevenueByTypeResult = RevenueByType;
export type TopProductResult = TopProduct;
export type AdminReportResult = Omit<AdminReport, keyof DailyReport> & DailyReportResult;

// ---------------------------------------------------------------------------
// buildAdminReport — extends buildReport with admin-only extras
// ---------------------------------------------------------------------------

/**
 * Build full admin report from raw completed orders with order_type.
 * Extends buildReport with: addon_usage, revenue_by_type, top_products.
 * top_products = all products sorted descending by total_cups.
 */
export function buildAdminReport(
  orders: RawAdminOrder[],
  powders: PowderConfig[],
  milkTypes: MilkConfig[],
  powderSizeEntries: PowderSizeEntry[],
  defaultSizeEntries: DefaultSizeEntry[]
): AdminReportResult {
  // -- Build base report using existing function --
  // Cast to RawOrder[] since base items are compatible (addons just have extra fields)
  const base = buildReport(
    orders as unknown as RawOrder[],
    powders,
    milkTypes,
    powderSizeEntries,
    defaultSizeEntries
  );

  // -- Addon usage accumulator: option ID → display data and powder totals --
  const addonMap = new Map<string, {
    addon_label: string;
    group_name: string;
    total_count: number;
    powder_grams_by_id: Map<string, number>;
  }>();
  const powderNameById = new Map(powders.map((powder) => [powder.id, powder.name]));

  // -- Revenue by type accumulator --
  const revenueMap = new Map<
    "COUNTER" | "PICKUP" | "DELIVERY",
    { total_revenue_vnd: number; order_count: number }
  >();

  // -- Top products: re-use latte_sales + fusion_sales from base, just resort --

  for (const order of orders) {
    // Revenue by type
    const prev = revenueMap.get(order.order_type);
    if (prev) {
      prev.total_revenue_vnd += order.total_vnd;
      prev.order_count += 1;
    } else {
      revenueMap.set(order.order_type, {
        total_revenue_vnd: order.total_vnd,
        order_count: 1,
      });
    }

    // Addon usage
    for (const item of order.items) {
      for (const addon of item.addons) {
        if (addon.quantity <= 0) continue;
        const usageQuantity = addon.quantity * item.quantity;
        const optionId = addon.addon_option_id;
        const existing = addonMap.get(optionId);
        if (existing) {
          existing.total_count += usageQuantity;
        } else {
          addonMap.set(optionId, {
            addon_label: addon.addonOption.label,
            group_name: addon.addonOption.group?.name ?? "",
            total_count: usageQuantity,
            powder_grams_by_id: new Map<string, number>(),
          });
        }

        const powderId = item.selected_powder_id ?? item.menuItem.matcha_powder_id;
        const gramValue = addon.addonOption.gram_value;
        if (powderId && gramValue != null) {
          const entry = addonMap.get(optionId);
          if (!entry) continue;
          const previousGrams = entry.powder_grams_by_id.get(powderId) ?? 0;
          entry.powder_grams_by_id.set(powderId, previousGrams + gramValue * usageQuantity);
        }
      }
    }
  }

  // -- Build addon_usage array (sorted descending by total_count) --
  const addonUsage: AddonUsageResult[] = [];
  for (const [addon_option_id, entry] of addonMap) {
    const powder_breakdown = Array.from(entry.powder_grams_by_id, ([powderId, total_grams]) => ({
      powder_name: powderNameById.get(powderId) ?? "Không rõ",
      total_grams,
    })).sort((a, b) => b.total_grams - a.total_grams || a.powder_name.localeCompare(b.powder_name));
    addonUsage.push({
      addon_option_id,
      addon_label: entry.addon_label,
      group_name: entry.group_name,
      total_count: entry.total_count,
      powder_breakdown,
    });
  }
  addonUsage.sort((a, b) =>
    b.total_count - a.total_count ||
    a.addon_label.localeCompare(b.addon_label) ||
    a.addon_option_id.localeCompare(b.addon_option_id),
  );

  // -- Build revenue_by_type array (sorted descending by revenue) --
  const revenueByType: RevenueByTypeResult[] = [];
  for (const [orderType, { total_revenue_vnd, order_count }] of revenueMap) {
    revenueByType.push({ order_type: orderType, total_revenue_vnd, order_count });
  }
  revenueByType.sort((a, b) => b.total_revenue_vnd - a.total_revenue_vnd);

  // -- Build top_products: sorted descending by total_cups, then alphabetically --
  const topProducts: TopProductResult[] = [
    ...base.latte_sales.map((s) => ({ name: s.name, category: "latte", total_cups: s.total_cups })),
    ...base.fusion_sales.map((s) => ({ name: s.name, category: "fusion", total_cups: s.total_cups })),
    ...base.extras_sales.map((s) => ({ name: s.name, category: "extras", total_cups: s.total_cups })),
  ].sort((a, b) => b.total_cups - a.total_cups || a.name.localeCompare(b.name));


  return {
    ...base,
    addon_usage: addonUsage,
    revenue_by_type: revenueByType,
    top_products: topProducts,
  };
}
