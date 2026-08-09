import { apiClient } from '@/src/lib/api/client';
import type { OrderRes } from './staffOrdersListService';
import type { OrderType, PaymentMethod } from '@/src/lib/types/order';

const ORDER_URLS = {
  staffById: (orderId: string) => `/api/staff/orders/${orderId}`,
  confirmPayment: (orderId: string) => `/api/admin/orders/${orderId}/confirm-payment`,
} as const;

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

/** Admin confirms online payment or completes a pending counter bank transfer. */
export async function confirmPayment(
  orderId: string,
  orderType?: OrderType,
  paymentMethod?: PaymentMethod,
): Promise<void> {
  if (orderType === "COUNTER" && paymentMethod === "BANK_TRANSFER") {
    await apiClient.patch(ORDER_URLS.staffById(orderId), { status: "COMPLETED" });
    return;
  }
  await apiClient.patch(ORDER_URLS.confirmPayment(orderId));
}

/** Admin huỷ một đơn hàng (bất kỳ trạng thái nào trừ COMPLETED). */
export async function adminCancelOrder(orderId: string): Promise<void> {
  await apiClient.patch(ORDER_URLS.staffById(orderId), { status: 'CANCELLED' });
}
