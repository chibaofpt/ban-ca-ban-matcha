/** Summary metrics for the report */
export interface ReportSummary {
  total_orders: number;
  total_cups: number;
  total_revenue_vnd: number;
}

/** Matcha powder usage aggregated across all order items */
export interface PowderUsage {
  powder_name: string;
  total_grams: number;
}

/** Milk usage aggregated across all Latte order items */
export interface MilkUsage {
  milk_name: string;
  total_ml: number;
}

/** Sales breakdown per menu item, grouped by size */
export interface ItemSales {
  name: string;
  sizes: { M: number; L: number; XL: number };
  total_cups: number;
}

/** Full daily report response shape */
export interface DailyReport {
  summary: ReportSummary;
  powder_usage: PowderUsage[];
  milk_usage: MilkUsage[];
  latte_sales: ItemSales[];
  fusion_sales: ItemSales[];
}

/** Staff member for admin dropdown */
export interface StaffMember {
  id: string;
  name: string;
  role: "STAFF" | "ADMIN";
}
