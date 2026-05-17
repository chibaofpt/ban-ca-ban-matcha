import { apiClient } from '@/src/lib/api/client';

export interface OrderItemRes {
  menuItem: { name: string };
  quantity: number;
  unit_price_vnd: number;
  addons_price_vnd: number;
  size: string;
  addons: {
    addonOption: { label: string };
    quantity: number;
  }[];
}

export interface OrderRes {
  id: string;
  status: "PENDING" | "CONFIRMED" | "READY" | "COMPLETED" | "CANCELLED";
  total_vnd: number;
  created_at: string;
  user: { name: string; phone_number: string };
  handled_by: string | null;
  items: OrderItemRes[];
}

/** Fetch danh sách tất cả order, newest first. */
export async function fetchOrdersList(): Promise<OrderRes[]> {
  const res = await apiClient.get('/api/staff/orders');
  return res.data.data;
}
