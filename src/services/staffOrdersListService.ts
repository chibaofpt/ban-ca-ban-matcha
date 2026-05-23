import { apiClient } from '@/src/lib/api/client';
import type { OrderStatus, OrderType } from '@/src/lib/types/order';

export interface OrderItemRes {
  menuItem: { name: string; category: string };
  quantity: number;
  unit_price_vnd: number;
  addons_price_vnd: number;
  size: string;
  sweetness: string;
  ice_option: string;
  coldwhisk: boolean;
  note: string | null;
  selectedPowder: { name: string; price_per_gram: number } | null;
  milkType: { name: string; is_default: boolean } | null;
  addons: {
    unit_price_vnd: number;
    addonOption: {
      label: string;
      gram_value: string | null;
      price_vnd: number;
      group: { name: string };
    };
    quantity: number;
  }[];
}

export interface OrderRes {
  id: string;
  status: OrderStatus;
  order_type: OrderType;
  /** Human-readable code for bank transfer. Null for COUNTER orders. */
  order_code: string | null;
  /** Auto-cancel deadline (ISO string). Null for COUNTER orders. */
  auto_cancel_at: string | null;
  subtotal_vnd: number;
  discount_vnd: number;
  total_vnd: number;
  created_at: string;
  /** Null for anonymous (walk-in) orders that have no linked customer. */
  user: { name: string; phone_number: string } | null;
  handled_by: string | null;
  voucher_id: string | null;
  items: OrderItemRes[];
}

export interface FetchOrdersListParams {
  /** Comma-separated: "COUNTER", "PICKUP", "DELIVERY" */
  order_type?: string;
  /** Single status: "PENDING" — admin only, for "Chờ CK" tab */
  status?: string;
}

/** Fetch danh sách orders cho trang quản lý của staff/admin. */
export async function fetchOrdersList(params: FetchOrdersListParams = {}): Promise<OrderRes[]> {
  const query = new URLSearchParams();
  if (params.order_type) query.append('order_type', params.order_type);
  if (params.status) query.append('status', params.status);
  const qs = query.toString();
  const res = await apiClient.get(`/api/staff/orders${qs ? `?${qs}` : ''}`);
  return res.data.data;
}
