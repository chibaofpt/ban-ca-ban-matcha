import type { Category, Size, SweetnessLevel } from "./menu";

export type OrderStatus =
  | "PENDING"
  | "ADMIN_CONFIRMED"
  | "STAFF_DONE"
  | "COMPLETED"
  | "CANCELLED";
export type OrderType = "COUNTER" | "PICKUP" | "DELIVERY";
export type PaymentMethod = "CASH" | "BANK_TRANSFER";
export type IceOption = "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";

export interface BundleSelectionAllocation {
  client_line_id: string;
  quantity: number;
  addon_option_id?: string;
}

export interface BundleApplicationPayload {
  voucher_qr_token: string;
  qualifier_allocations: BundleSelectionAllocation[];
  reward_allocations: BundleSelectionAllocation[];
}

export interface OrderAddonVoucherSelection {
  voucher_id: string;
  addon_option_id: string;
}

export interface OrderItemPayload {
  client_line_id?: string;
  menu_item_id: string;
  quantity: number;
  size?: Size | null;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note?: string;
  addon_option_ids: string[];
  product_voucher_id?: string;
  item_voucher_id?: string;
  addon_voucher_ids?: OrderAddonVoucherSelection[];
  selected_powder_id?: string;
  selected_milk_type_id?: string;
  selected_base_liquid_id?: string;
  client_price_vnd: number;
}

export interface CreateOrderPayload {
  order_type: "PICKUP" | "DELIVERY";
  items: OrderItemPayload[];
  discount_voucher_ids: string[];
  pickup_time?: string;
  note?: string;
  delivery_address?: string;
  address_id?: string;
  delivery_lat?: number;
  delivery_lng?: number;
  delivery_receiver_name?: string;
  delivery_receiver_phone?: string;
  client_shipping_fee_vnd?: number;
  freeship_voucher_id?: string;
  bundle_applications?: BundleApplicationPayload[];
}

export interface CreateStaffOrderPayload {
  phone_number?: string;
  customer_name?: string;
  payment_method?: PaymentMethod;
  items: OrderItemPayload[];
  discount_voucher_ids?: string[];
  bundle_applications?: BundleApplicationPayload[];
  customer_qr_token?: string;
}

export interface PriceConflict {
  menu_item_id: string;
  name: string;
  size: string;
  client_price_vnd: number;
  server_price_vnd: number;
}

export interface CancellationAdjustment {
  revoked_voucher_count: number;
  refunded_points: number;
  reversed_points: number;
}

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
  created_at?: string;
  cancellation_adjustment?: CancellationAdjustment;
}

export interface OrderItemAddonDetail {
  addon_option_id?: string;
  unit_price_vnd: number;
  quantity: number;
  addonOption: {
    label: string;
    gram_value: string | null;
    price_vnd: number;
    group: { name: string };
  };
}

export interface OrderItemDetail {
  menu_item_id?: string;
  menuItem: { name: string; category: Category };
  quantity: number;
  unit_price_vnd: number;
  addons_price_vnd: number;
  total_discount_vnd?: number;
  product_voucher_discount_vnd?: number;
  size: Size | null;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  selected_powder_id?: string | null;
  selected_milk_type_id?: string | null;
  selectedPowder: { name: string; price_per_gram?: string } | null;
  milkType: { name: string; is_default: boolean } | null;
  addons: OrderItemAddonDetail[];
  productVoucher?: { package: { name: string } } | null;
  itemVoucher?: { package: { name: string } } | null;
  addonVouchers?: Array<{
    discount_applied_vnd?: number;
    voucher: { package: { name: string } };
  }>;
}

export interface CustomerOrderDetail {
  id: string;
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
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
  created_at: string;
  items: OrderItemDetail[];
  address_id: string | null;
  delivery_address: string | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_distance_km: number | null;
  delivery_receiver_name: string | null;
  delivery_receiver_phone: string | null;
}

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
  skipped_vouchers: string[];
}

export interface HistoryOrderItem extends OrderItemDetail {
  menu_item_id: string;
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
}

export interface CustomerHistoryOrderItem extends HistoryOrderItem {
  selectedPowder: { name: string; price_per_gram: string } | null;
}

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
  points_earned: number;
  pickup_time: string | null;
  created_at: string;
  updated_at?: string;
  auto_cancel_at: string | null;
  payment_qr_url: string | null;
  discountVouchers?: Array<{ voucher: { package: { name: string } } }>;
  items: CustomerHistoryOrderItem[];
}

export interface OrderListItem {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method?: PaymentMethod;
  order_code: string | null;
  auto_cancel_at: string | null;
  payment_qr_url?: string | null;
  pickup_time: string | null;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  created_at: string;
  updated_at?: string;
  user: { name: string; phone_number: string } | null;
  discountVouchers?: Array<{
    voucher: {
      discount_value: number | null;
      discount_type: string | null;
      package: { name: string };
    };
  }>;
  items: OrderItemDetail[];
}

export interface OrderPageMeta {
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: OrderPageMeta;
}

export type CustomerHistoryOrdersResponse = PaginatedResponse<CustomerHistoryOrder>;
export type PaginatedOrdersListRes = PaginatedResponse<OrderListItem>;

export interface FetchOrdersListParams {
  order_type?: string;
  status?: string;
  page?: number;
  limit?: number;
  mine?: boolean;
}

export interface StaffOrderStatusPayload {
  status: "ADMIN_CONFIRMED" | "STAFF_DONE" | "COMPLETED" | "CANCELLED";
}

export interface CustomerOrderCancelPayload {
  status: "CANCELLED";
}
