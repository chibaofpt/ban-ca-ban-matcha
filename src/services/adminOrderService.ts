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
  order_type?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    totalPages: number;
  };
}

/** Lấy danh sách order cho Admin (có bộ lọc). */
export async function fetchAdminOrders(filters: AdminOrderFilters = {}): Promise<PaginatedResponse<AdminOrderRes>> {
  const params = new URLSearchParams();
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.search) params.append('search', filters.search);
  if (filters.staffId) params.append('staffId', filters.staffId);
  if (filters.staffName) params.append('staffName', filters.staffName);
  if (filters.order_type) params.append('order_type', filters.order_type);
  if (filters.status) params.append('status', filters.status);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const res = await apiClient.get(`/api/admin/orders?${params.toString()}`);
  return res.data;
}

/** Admin xác nhận thanh toán chuyển khoản cho một customer PICKUP order. */
export async function confirmPayment(orderId: string): Promise<void> {
  await apiClient.patch(`/api/admin/orders/${orderId}/confirm-payment`);
}

/** Admin huỷ một đơn hàng (bất kỳ trạng thái nào trừ COMPLETED). */
export async function adminCancelOrder(orderId: string): Promise<void> {
  await apiClient.patch(`/api/staff/orders/${orderId}`, { status: 'CANCELLED' });
}
