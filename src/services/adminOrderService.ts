import { apiClient } from '@/src/lib/api/client';
import type { OrderRes } from './staffOrdersListService';
import type { OrderType, PaymentMethod } from '@/src/lib/types/order';
import type { ApiError, ApiResponse } from '@/src/lib/types/api';
import type { StaffOrderResult } from '@/src/lib/types/order';
import { isAxiosError } from 'axios';

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

/** Cancel an eligible order and return the server-committed point/voucher adjustment. */
export async function adminCancelOrder(orderId: string): Promise<StaffOrderResult> {
  try {
    const response = await apiClient.patch<ApiResponse<StaffOrderResult>>(
      ORDER_URLS.staffById(orderId), { status: 'CANCELLED' },
    );
    return response.data.data;
  } catch (error: unknown) {
    if (isAxiosError<ApiError<{ reason?: string }>>(error) && error.response &&
      typeof error.response.data?.error === 'string' &&
      typeof error.response.data.code === 'string') {
      throw new AdminOrderServiceError(
        error.response.data.error,
        error.response.status,
        error.response.data.code,
        error.response.data.details,
      );
    }
    throw error;
  }
}

export class AdminOrderServiceError<TDetails = unknown> extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: TDetails,
  ) {
    super(message);
    this.name = 'AdminOrderServiceError';
  }
}
