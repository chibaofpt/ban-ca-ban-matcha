import { apiClient } from '@/src/lib/api/client';

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
      gram_value: string | null; // typically decimal or null in prisma, string representation
      price_vnd: number;
      group: { name: string };
    };
    quantity: number;
  }[];
}

export interface OrderRes {
  id: string;
  status: "PENDING" | "CONFIRMED" | "READY" | "COMPLETED" | "CANCELLED";
  total_vnd: number;
  created_at: string;
  /** null for anonymous (walk-in) orders that have no linked customer. */
  user: { name: string; phone_number: string } | null;
  handled_by: string | null;
  items: OrderItemRes[];
}

/** Fetch danh sách tất cả order, newest first. */
export async function fetchOrdersList(): Promise<OrderRes[]> {
  const res = await apiClient.get('/api/staff/orders');
  return res.data.data;
}
