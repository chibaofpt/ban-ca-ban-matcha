/** Order status in the new customer pick-up workflow. */
export type OrderStatus =
  | "PENDING"
  | "ADMIN_CONFIRMED"
  | "STAFF_DONE"
  | "COMPLETED"
  | "CANCELLED";

/** How the order was placed. */
export type OrderType = "COUNTER" | "PICKUP" | "DELIVERY";

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
  /** e.g. "BCBM-A3X7K2". Null for COUNTER orders. */
  order_code: string | null;
  status: OrderStatus;
  order_type: OrderType;
  voucher_id: string | null;
  subtotal_vnd: number;
  discount_vnd: number;
  total_vnd: number;
  pickup_time: string | null;
  /** ISO datetime of auto-cancel deadline. Null for COUNTER orders. */
  auto_cancel_at: string | null;
  /** VietQR payment image URL. Only present when status = PENDING. */
  payment_qr_url: string | null;
  created_at: string;
  items: OrderItemDetail[];
}

/** Slim result returned immediately after creating a new customer order. */
export interface CreateOrderResult {
  id: string;
  order_code: string;
  status: OrderStatus;
  order_type: OrderType;
  subtotal_vnd: number;
  discount_vnd: number;
  total_vnd: number;
  pickup_time: string | null;
  auto_cancel_at: string;
  payment_qr_url: string;
}
