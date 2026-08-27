/** Summary metrics for the report */
export interface ReportSummary {
  total_orders: number;
  total_cups: number;
  /** Breakdown tổng ly theo size */
  cups_by_size: { SMALL: number; MEDIUM: number; LARGE: number };
  total_extras_units?: number;
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
  sizes: { SMALL: number; MEDIUM: number; LARGE: number };
  total_cups: number;
}

/** Full daily report response shape */
export interface DailyReport {
  summary: ReportSummary;
  powder_usage: PowderUsage[];
  milk_usage: MilkUsage[];
  latte_sales: ItemSales[];
  fusion_sales: ItemSales[];
  extras_sales?: ItemSales[];
}

/** Staff member for admin dropdown */
export interface StaffMember {
  qr_token: string;
  /** One-release public-token alias retained for older consumers. */
  id: string;
  name: string;
  role: "STAFF" | "ADMIN";
}

// ---------------------------------------------------------------------------
// Staff-only report (minimal — chỉ summary cơ bản, không có powder/milk/sales)
// ---------------------------------------------------------------------------

/** Staff report — chỉ trả tổng đơn và doanh thu */
export interface StaffReport {
  summary: {
    total_orders: number;
    total_revenue_vnd: number;
  };
}

// ---------------------------------------------------------------------------
// Admin-only report extras
// ---------------------------------------------------------------------------

/** Số lượt dùng từng addon option trong khoảng thời gian */
export interface AddonUsage {
  addon_option_id: string;
  addon_label: string;
  group_name: string;
  total_count: number;
  powder_breakdown: AddonPowderBreakdown[];
}

/** Số gram bột đã dùng cho một addon option, nhóm theo loại bột. */
export interface AddonPowderBreakdown {
  powder_name: string;
  total_grams: number;
}

/** Doanh thu và số đơn theo phương thức đặt hàng */
export interface RevenueByType {
  order_type: "COUNTER" | "PICKUP" | "DELIVERY";
  total_revenue_vnd: number;
  order_count: number;
}

/** Sản phẩm bán chạy — sorted descending theo total_cups */
export interface TopProduct {
  name: string;
  category: string;
  total_cups: number;
}

/** Full admin report (mở rộng DailyReport với 3 mục bổ sung) */
export interface AdminReport extends DailyReport {
  addon_usage: AddonUsage[];
  revenue_by_type: RevenueByType[];
  top_products: TopProduct[];
}
