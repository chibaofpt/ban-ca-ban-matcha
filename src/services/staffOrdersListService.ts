import { apiClient } from '@/src/lib/api/client';
import type { OrderStatus, OrderType, PaymentMethod } from '@/src/lib/types/order';

export interface OrderItemRes {
  menuItem: { name: string; category: string };
  quantity: number;
  unit_price_vnd: number;
  addons_price_vnd: number;
  total_discount_vnd?: number;
  product_voucher_discount_vnd?: number;
  size: string;
  sweetness: string;
  ice_option: string;
  coldwhisk: boolean;
  note: string | null;
  selectedPowder: { name: string; price_per_gram: number } | null;
  menu_item_id?: string;
  selected_powder_id?: string | null;
  selected_milk_type_id?: string | null;
  milkType: { name: string; is_default: boolean } | null;
  addons: {
    addon_option_id?: string;
    unit_price_vnd: number;
    addonOption: {
      label: string;
      gram_value: string | null;
      price_vnd: number;
      group: { name: string };
    };
    quantity: number;
  }[];
  productVoucher?: { package: { name: string } } | null;
  addonVouchers?: Array<{ discount_applied_vnd?: number; voucher: { package: { name: string } } }>;
}

export interface OrderRes {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  payment_method?: PaymentMethod;
  /** Human-readable bank-transfer reference. Null for cash orders. */
  order_code: string | null;
  /** Auto-cancel deadline (ISO string). Null for cash orders. */
  auto_cancel_at: string | null;
  /** VietQR image for pending bank transfers only. */
  payment_qr_url?: string | null;
  pickup_time: string | null;
  subtotal_vnd: number;
  total_voucher_discount_vnd: number;
  total_vnd: number;
  shipping_fee_vnd: number;
  freeship_discount_vnd: number;
  grand_total_vnd: number;
  created_at: string;
  /** Null for anonymous (walk-in) orders that have no linked customer. */
  user: { name: string; phone_number: string } | null;
  discountVouchers?: Array<{
    voucher: {
      discount_value: number | null;
      discount_type: string | null;
      package: { name: string };
    };
  }>;
  items: OrderItemRes[];
}

export interface FetchOrdersListParams {
  /** Comma-separated: "COUNTER", "PICKUP", "DELIVERY" */
  order_type?: string;
  /** Single status. Staff PENDING scope is limited server-side to their own counter transfers. */
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedOrdersListRes {
  data: OrderRes[];
  meta: {
    total: number;
    page: number;
    totalPages: number;
  };
}

/** Fetch danh sách orders cho trang quản lý của staff/admin. */
export async function fetchOrdersList(params: FetchOrdersListParams = {}): Promise<PaginatedOrdersListRes> {
  const query = new URLSearchParams();
  if (params.order_type) query.append('order_type', params.order_type);
  if (params.status) query.append('status', params.status);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  const qs = query.toString();
  const res = await apiClient.get(`/api/staff/orders${qs ? `?${qs}` : ''}`);
  return res.data;
}
