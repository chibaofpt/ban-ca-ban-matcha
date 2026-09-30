// Pure aggregation logic for daily reports — no DB or Prisma deps

import type {
  DailyReport,
  ItemSales as ContractItemSales,
  MilkUsage as ContractMilkUsage,
  PowderUsage as ContractPowderUsage,
  ReportSummary as ContractReportSummary,
} from "@/contracts/report";

// ---------------------------------------------------------------------------
// Input types (data fetched from Prisma, Decimal already converted to number)
// ---------------------------------------------------------------------------

export interface RawOrderItem {
  /** FK to menu_items.id */
  menu_item_id: string;
  quantity: number;
  size: "SMALL" | "MEDIUM" | "LARGE" | null;
  /** null for Latte items (server resolves to matcha_powder_id) */
  selected_powder_id: string | null;
  /** null for Fusion items */
  selected_milk_type_id: string | null;
  /** Immutable order-time snapshot. Missing/null only for legacy orders. */
  base_liquid_ml?: number | null;
  menuItem: {
    name: string;
    /** "latte" | "fusion" */
    category: string;
    /** Fixed powder for Latte; null for Fusion */
    matcha_powder_id: string | null;
    /** Per-item gram overrides; null when not set */
    custom_powder_grams: Record<string, number> | null;
    sizes?: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; base_liquid_ml: number | null }>;
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

export type ReportSummary = ContractReportSummary;
export type PowderUsage = ContractPowderUsage;
export type MilkUsage = ContractMilkUsage;
export type ItemSales = ContractItemSales;
export type DailyReportResult = Omit<DailyReport, "summary" | "extras_sales"> & {
  summary: Omit<ContractReportSummary, "total_extras_units"> & { total_extras_units: number };
  extras_sales: ContractItemSales[];
};

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
  if (!item.size) return 0;
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
  let totalExtrasUnits = 0;
  let totalRevenue = 0;
  const cupsBySize = { SMALL: 0, MEDIUM: 0, LARGE: 0 };

  /** powder_id → total grams */
  const powderGramMap = new Map<string, number>();
  /** milk_id → total ml */
  const milkMlMap = new Map<string, number>();
  /** menu_item_id → { name, category, sizes } */
  const salesMap = new Map<
    string,
    { name: string; category: string; total_cups: number; sizes: { SMALL: number; MEDIUM: number; LARGE: number } }
  >();

  for (const order of orders) {
    totalOrders++;
    totalRevenue += order.total_vnd;

    for (const item of order.items) {
      const qty = item.quantity;
      if (item.menuItem.category === "extras") {
        totalExtrasUnits += qty;
      } else {
        totalCups += qty;
        if (item.size) cupsBySize[item.size] += qty;
      }

      // -- Powder usage --
      const powderId = item.selected_powder_id ?? item.menuItem.matcha_powder_id;
      if (powderId) {
        const baseGram = resolveEffectiveGram(item, powderSizeEntries, defaultSizeEntries);
        const baseTotal = baseGram * qty;

        // Extra matcha addons
        const extraGram = item.addons.reduce((sum, addon) => {
          const gv = addon.addonOption.gram_value;
          if (gv == null) return sum;
          return sum + gv * addon.quantity * qty;
        }, 0);

        const prev = powderGramMap.get(powderId) ?? 0;
        powderGramMap.set(powderId, prev + baseTotal + extraGram);
      }

      // -- Base Liquid usage (Latte and configured Fusion) --
      if (item.selected_milk_type_id) {
        const defaultSize = defaultSizeEntries.find((e) => e.size === item.size);
        const legacyRecipeMl = item.menuItem.sizes?.find(
          (row) => row.size === item.size,
        )?.base_liquid_ml;
        const effectiveMl = item.base_liquid_ml ?? legacyRecipeMl ?? defaultSize?.milk_ml;
        if (effectiveMl !== undefined) {
          const mlTotal = effectiveMl * qty;
          const prevMl = milkMlMap.get(item.selected_milk_type_id) ?? 0;
          milkMlMap.set(item.selected_milk_type_id, prevMl + mlTotal);
        }
      }

      // -- Sales breakdown --
      const existing = salesMap.get(item.menu_item_id);
      if (existing) {
        existing.total_cups += qty;
        if (item.size) existing.sizes[item.size] += qty;
      } else {
        salesMap.set(item.menu_item_id, {
          name: item.menuItem.name,
          category: item.menuItem.category,
          total_cups: qty,
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
  const extrasSales: ItemSales[] = [];
  for (const [, { name, category, sizes, total_cups }] of salesMap) {
    const totalCupsItem = total_cups;
    const entry: ItemSales = { name, sizes, total_cups: totalCupsItem };
    if (category === "latte") {
      latteSales.push(entry);
    } else if (category === "fusion") {
      fusionSales.push(entry);
    } else if (category === "extras") {
      extrasSales.push(entry);
    }
  }

  return {
    summary: {
      total_orders: totalOrders,
      total_cups: totalCups,
      cups_by_size: cupsBySize,
      total_extras_units: totalExtrasUnits,
      total_revenue_vnd: totalRevenue,
    },
    powder_usage: powderUsage,
    milk_usage: milkUsage,
    latte_sales: latteSales,
    fusion_sales: fusionSales,
    extras_sales: extrasSales,
  };
}

