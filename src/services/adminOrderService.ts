import { apiClient } from '@/src/lib/api/client';
import type { OrderRes } from './staffOrdersListService';

export interface AdminOrderRes extends OrderRes {
  handler: { name: string } | null;
}

export interface AdminOrderFilters {
  startDate?: string;
  endDate?: string;
  search?: string;
  staffId?: string;
  staffName?: string;
}

/** Lấy danh sách order cho Admin (có bộ lọc). */
export async function fetchAdminOrders(filters: AdminOrderFilters = {}): Promise<AdminOrderRes[]> {
  const params = new URLSearchParams();
  if (filters.startDate) params.append("startDate", filters.startDate);
  if (filters.endDate) params.append("endDate", filters.endDate);
  if (filters.search) params.append("search", filters.search);
  if (filters.staffId) params.append("staffId", filters.staffId);
  if (filters.staffName) params.append("staffName", filters.staffName);

  const res = await apiClient.get(`/api/admin/orders?${params.toString()}`);
  return res.data.data;
}

/** Huỷ một order theo id (chỉ ADMIN). */
export async function cancelOrder(id: string) {
  // TODO: implement PATCH /api/admin/orders/[id]/status
}
