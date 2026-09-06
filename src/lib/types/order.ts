/** Order status in the new customer pick-up workflow. */
export type OrderStatus =
  | "PENDING"
  | "ADMIN_CONFIRMED"
  | "STAFF_DONE"
  | "COMPLETED"
  | "CANCELLED";

/** How the order was placed. */
export type OrderType = "COUNTER" | "PICKUP" | "DELIVERY";

/** How an order is paid. */
export type PaymentMethod = "CASH" | "BANK_TRANSFER";

/** Point and voucher adjustments committed atomically with an admin cancellation. */
export interface CancellationAdjustment {
  revoked_voucher_count: number;
  refunded_points: number;
  reversed_points: number;
}

/** Public order snapshot returned by staff create/detail/status APIs. */
export interface StaffOrderResult {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method: PaymentMethod;
  order_code: string | null;
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  points_earned: number | null;
  skipped_vouchers: string[];
  cancellation_adjustment?: CancellationAdjustment;
}

/** A single addon on an order item as returned by the tracking API. */
export interface OrderItemAddonDetail {
  unit_price_vnd: number;
  quantity: number;
  addonOption: {
    label: string;
    gram_value: string | null;
    price_vnd: number;
    group: { name: string };
  };
}

/** A single line item on a customer order as returned by the tracking API. */
export interface OrderItemDetail {
  menuItem: { name: string; category: string };
  quantity: number;
  unit_price_vnd: number;
  addons_price_vnd: number;
  size: string;
  sweetness: string;
  ice_option: string;
  coldwhisk: boolean;
  note: string | null;
  selectedPowder: { name: string } | null;
  milkType: { name: string; is_default: boolean } | null;
  addons: OrderItemAddonDetail[];
}

/** Full customer order detail returned by GET /api/orders/[id]. */
export interface CustomerOrderDetail {
  id: string;
  /** e.g. "BCBM-A3X7K2". Null for cash orders. */
  order_code: string | null;
  status: OrderStatus;
  order_type: OrderType;
  payment_method?: PaymentMethod;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  pickup_time: string | null;
  /** ISO datetime of auto-cancel deadline. Null for cash orders. */
  auto_cancel_at: string | null;
  /** VietQR payment image URL. Only present when status = PENDING. */
  payment_qr_url: string | null;
  created_at: string;
  items: OrderItemDetail[];
  
  // Delivery fields
  address_id: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_distance_km: number | null;
  delivery_receiver_name: string | null;
  delivery_receiver_phone: string | null;
}

/** Slim result returned immediately after creating a new customer order. */
export interface CreateOrderResult {
  id: string;
  order_code: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method: PaymentMethod;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  pickup_time: string | null;
  auto_cancel_at: string;
  payment_qr_url: string;
  /** Voucher QR tokens skipped because they produced no incremental benefit. */
  skipped_vouchers: string[];
}

/** Enriched item returned in the customer order-history list. */
export interface CustomerHistoryOrderItem extends HistoryOrderItem {
  selectedPowder: { name: string; price_per_gram: number } | null;
  milkType: { name: string; is_default: boolean } | null;
  productVoucher?: { package: { name: string } } | null;
  /** Discount amount applied by the product voucher on this item. */
  product_voucher_discount_vnd?: number;
  addonVouchers?: Array<{ discount_applied_vnd?: number; voucher: { package: { name: string } } }>;
}

/** Customer order card returned by the paginated history endpoint. */
export interface CustomerHistoryOrder {
  id: string;
  order_code: string | null;
  status: OrderStatus;
  order_type: OrderType;
  payment_method?: PaymentMethod;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  created_at: string;
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
  discountVouchers?: Array<{ voucher: { package: { name: string } } }>;
  items: CustomerHistoryOrderItem[];
}

/** Paginated customer order-history response. */
export interface CustomerHistoryOrdersResponse {
  data: CustomerHistoryOrder[];
  meta: { total: number; page: number; limit?: number; totalPages: number };
}
import type { HistoryOrderItem } from "@/src/lib/types/reorder";
