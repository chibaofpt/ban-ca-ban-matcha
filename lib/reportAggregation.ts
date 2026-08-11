// Pure aggregation logic for daily reports — no DB or Prisma deps

// ---------------------------------------------------------------------------
// Input types (data fetched from Prisma, Decimal already converted to number)
// ---------------------------------------------------------------------------

export interface RawOrderItem {
  /** FK to menu_items.id */
  menu_item_id: string;
  quantity: number;
  size: "SMALL" | "MEDIUM" | "LARGE";
  /** null for Latte items (server resolves to matcha_powder_id) */
  selected_powder_id: string | null;
  /** null for Fusion items */
  selected_milk_type_id: string | null;
  menuItem: {
    name: string;
    /** "latte" | "fusion" */
    category: string;
    /** Fixed powder for Latte; null for Fusion */
    matcha_powder_id: string | null;
    /** Per-item gram overrides; null when not set */
    custom_powder_grams: Record<string, number> | null;
  };
  addons: Array<{
    quantity: number;
    addonOption: {
      /** Non-null only for extra matcha addon options */
      gram_value: number | null;
    };
  }>;
}

export interface RawOrder {
  total_vnd: number;
  items: RawOrderItem[];
}

export interface PowderConfig {
  id: string;
  name: string;
}

export interface PowderSizeEntry {
  powder_id: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  grams: number;
}

export interface DefaultSizeEntry {
  size: "SMALL" | "MEDIUM" | "LARGE";
  milk_ml: number;
  powder_gram: number;
}

export interface MilkConfig {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Output types (matches DailyReport in src/lib/types/report.ts)
// ---------------------------------------------------------------------------

export interface ReportSummary {
  total_orders: number;
  total_cups: number;
  /** Breakdown tổng ly theo size (SMALL/MEDIUM/LARGE) */
  cups_by_size: { SMALL: number; MEDIUM: number; LARGE: number };
  total_revenue_vnd: number;
}

export interface PowderUsage {
  powder_name: string;
  total_grams: number;
}

export interface MilkUsage {
  milk_name: string;
  total_ml: number;
}

export interface ItemSales {
  name: string;
  sizes: { SMALL: number; MEDIUM: number; LARGE: number };
  total_cups: number;
}

export interface DailyReportResult {
  summary: ReportSummary;
  powder_usage: PowderUsage[];
  milk_usage: MilkUsage[];
  latte_sales: ItemSales[];
  fusion_sales: ItemSales[];
}

// ---------------------------------------------------------------------------
// resolveEffectiveGram — 3-level COALESCE (pure, no DB deps)
// ---------------------------------------------------------------------------

/**
 * Resolve effective gram for one order item using the 3-level COALESCE:
 * 1. menu_item.custom_powder_grams[size]
 * 2. powder_size_config[powder_id][size]
 * 3. default_size_config[size].powder_gram
 * Returns 0 when powder_id cannot be resolved (both IDs null).
 */
export function resolveEffectiveGram(
  item: Pick<RawOrderItem, "size" | "selected_powder_id" | "menuItem">,
  powderSizeEntries: PowderSizeEntry[],
  defaultSizeEntries: DefaultSizeEntry[]
): number {
  const powderId = item.selected_powder_id ?? item.menuItem.matcha_powder_id;
  if (!powderId) return 0;

  // Level 1: custom_powder_grams on menu_item
  const custom = item.menuItem.custom_powder_grams?.[item.size];
  if (custom != null) return custom;

  // Level 2: powder_size_config
  const powderEntry = powderSizeEntries.find(
    (e) => e.powder_id === powderId && e.size === item.size
  );
  if (powderEntry != null) return powderEntry.grams;

  // Level 3: default_size_config
  const defaultEntry = defaultSizeEntries.find((e) => e.size === item.size);
  return defaultEntry?.powder_gram ?? 0;
}

// ---------------------------------------------------------------------------
// buildReport — aggregate all data from completed orders (pure, no DB deps)
// ---------------------------------------------------------------------------

/**
 * Build the full daily report from raw completed orders and lookup tables.
 * All Decimal values must be converted to number before calling this function.
 */
export function buildReport(
  orders: RawOrder[],
  powders: PowderConfig[],
  milkTypes: MilkConfig[],
  powderSizeEntries: PowderSizeEntry[],
  defaultSizeEntries: DefaultSizeEntry[]
): DailyReportResult {
  // -- Index lookup maps --
  const powderNameById = new Map(powders.map((p) => [p.id, p.name]));
  const milkNameById = new Map(milkTypes.map((m) => [m.id, m.name]));

  // -- Accumulators --
  let totalOrders = 0;
  let totalCups = 0;
  let totalRevenue = 0;
  const cupsBySize = { SMALL: 0, MEDIUM: 0, LARGE: 0 };

  /** powder_id → total grams */
  const powderGramMap = new Map<string, number>();
  /** milk_id → total ml */
  const milkMlMap = new Map<string, number>();
  /** menu_item_id → { name, category, sizes } */
  const salesMap = new Map<
    string,
    { name: string; category: string; sizes: { SMALL: number; MEDIUM: number; LARGE: number } }
  >();

  for (const order of orders) {
    totalOrders++;
    totalRevenue += order.total_vnd;

    for (const item of order.items) {
      const qty = item.quantity;
      totalCups += qty;
      cupsBySize[item.size] += qty;

      // -- Powder usage --
      const powderId = item.selected_powder_id ?? item.menuItem.matcha_powder_id;
      if (powderId) {
        const baseGram = resolveEffectiveGram(item, powderSizeEntries, defaultSizeEntries);
        const baseTotal = baseGram * qty;

        // Extra matcha addons
        const extraGram = item.addons.reduce((sum, addon) => {
          const gv = addon.addonOption.gram_value;
          if (gv == null) return sum;
          return sum + gv * addon.quantity;
        }, 0);

        const prev = powderGramMap.get(powderId) ?? 0;
        powderGramMap.set(powderId, prev + baseTotal + extraGram);
      }

      // -- Milk usage (Latte only) --
      if (item.menuItem.category === "latte" && item.selected_milk_type_id) {
        const defaultSize = defaultSizeEntries.find((e) => e.size === item.size);
        if (defaultSize) {
          const mlTotal = defaultSize.milk_ml * qty;
          const prevMl = milkMlMap.get(item.selected_milk_type_id) ?? 0;
          milkMlMap.set(item.selected_milk_type_id, prevMl + mlTotal);
        }
      }

      // -- Sales breakdown --
      const existing = salesMap.get(item.menu_item_id);
      if (existing) {
        existing.sizes[item.size] += qty;
      } else {
        salesMap.set(item.menu_item_id, {
          name: item.menuItem.name,
          category: item.menuItem.category,
          sizes: {
            SMALL: item.size === "SMALL" ? qty : 0,
            MEDIUM: item.size === "MEDIUM" ? qty : 0,
            LARGE: item.size === "LARGE" ? qty : 0,
          },
        });
      }
    }
  }

  // -- Build powder_usage (exclude powders with 0g) --
  const powderUsage: PowderUsage[] = [];
  for (const [powderId, totalGrams] of powderGramMap) {
    if (totalGrams <= 0) continue;
    const name = powderNameById.get(powderId) ?? powderId;
    powderUsage.push({ powder_name: name, total_grams: totalGrams });
  }

  // -- Build milk_usage --
  const milkUsage: MilkUsage[] = [];
  for (const [milkId, totalMl] of milkMlMap) {
    const name = milkNameById.get(milkId) ?? milkId;
    milkUsage.push({ milk_name: name, total_ml: totalMl });
  }

  // -- Build latte_sales and fusion_sales --
  const latteSales: ItemSales[] = [];
  const fusionSales: ItemSales[] = [];
  for (const [, { name, category, sizes }] of salesMap) {
    const totalCupsItem = sizes.SMALL + sizes.MEDIUM + sizes.LARGE;
    const entry: ItemSales = { name, sizes, total_cups: totalCupsItem };
    if (category === "latte") {
      latteSales.push(entry);
    } else {
      fusionSales.push(entry);
    }
  }

  return {
    summary: {
      total_orders: totalOrders,
      total_cups: totalCups,
      cups_by_size: cupsBySize,
      total_revenue_vnd: totalRevenue,
    },
    powder_usage: powderUsage,
    milk_usage: milkUsage,
    latte_sales: latteSales,
    fusion_sales: fusionSales,
  };
}

// ---------------------------------------------------------------------------
// RawAdminOrder — extends RawOrder with order_type
// ---------------------------------------------------------------------------

/** Order item addon for admin report (includes label + group) */
export interface RawAdminAddonItem {
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

export interface AddonUsageResult {
  addon_label: string;
  group_name: string;
  total_count: number;
}

export interface RevenueByTypeResult {
  order_type: "COUNTER" | "PICKUP" | "DELIVERY";
  total_revenue_vnd: number;
  order_count: number;
}

export interface TopProductResult {
  name: string;
  category: string;
  total_cups: number;
}

export interface AdminReportResult extends DailyReportResult {
  addon_usage: AddonUsageResult[];
  revenue_by_type: RevenueByTypeResult[];
  top_products: TopProductResult[];
}

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

  // -- Addon usage accumulator: label → { group_name, total_count } --
  const addonMap = new Map<string, { group_name: string; total_count: number }>();

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
        const label = addon.addonOption.label;
        const groupName = addon.addonOption.group?.name ?? "";
        const existing = addonMap.get(label);
        if (existing) {
          existing.total_count += addon.quantity;
        } else {
          addonMap.set(label, { group_name: groupName, total_count: addon.quantity });
        }
      }
    }
  }

  // -- Build addon_usage array (sorted descending by total_count) --
  const addonUsage: AddonUsageResult[] = [];
  for (const [label, { group_name, total_count }] of addonMap) {
    addonUsage.push({ addon_label: label, group_name, total_count });
  }
  addonUsage.sort((a, b) => b.total_count - a.total_count || a.addon_label.localeCompare(b.addon_label));

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
  ].sort((a, b) => b.total_cups - a.total_cups || a.name.localeCompare(b.name));


  return {
    ...base,
    addon_usage: addonUsage,
    revenue_by_type: revenueByType,
    top_products: topProducts,
  };
}
