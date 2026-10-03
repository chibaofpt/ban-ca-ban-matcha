export interface ReportSummary {
  total_orders: number;
  total_cups: number;
  cups_by_size: { SMALL: number; MEDIUM: number; LARGE: number };
  total_extras_units?: number;
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

export interface DailyReport {
  summary: ReportSummary;
  powder_usage: PowderUsage[];
  milk_usage: MilkUsage[];
  latte_sales: ItemSales[];
  fusion_sales: ItemSales[];
  extras_sales?: ItemSales[];
}

export interface StaffMember {
  qr_token: string;
  /** One-release public-token alias retained for older consumers. */
  id: string;
  name: string;
  role: "STAFF" | "ADMIN";
}

export interface StaffReport {
  summary: {
    total_orders: number;
    total_revenue_vnd: number;
  };
}

export interface AddonPowderBreakdown {
  powder_name: string;
  total_grams: number;
}

export interface AddonUsage {
  addon_option_id: string;
  addon_label: string;
  group_name: string;
  total_count: number;
  powder_breakdown: AddonPowderBreakdown[];
}

export interface RevenueByType {
  order_type: "COUNTER" | "PICKUP" | "DELIVERY";
  total_revenue_vnd: number;
  order_count: number;
}

export interface TopProduct {
  name: string;
  category: string;
  total_cups: number;
}

export interface AdminReport extends DailyReport {
  addon_usage: AddonUsage[];
  revenue_by_type: RevenueByType[];
  top_products: TopProduct[];
}
