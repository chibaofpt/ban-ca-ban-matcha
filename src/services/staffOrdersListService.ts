import { apiClient } from '@/src/lib/api/client';
import type {
  FetchOrdersListParams,
  OrderItemDetail,
  OrderListItem,
  PaginatedOrdersListRes,
} from '@/contracts/order';

export type OrderItemRes = OrderItemDetail;
export type OrderRes = OrderListItem;
export type { FetchOrdersListParams, PaginatedOrdersListRes } from '@/contracts/order';

/** Fetch danh sách orders cho trang quản lý của staff/admin. */
export async function fetchOrdersList(params: FetchOrdersListParams = {}): Promise<PaginatedOrdersListRes> {
  const query = new URLSearchParams();
  if (params.order_type) query.append('order_type', params.order_type);
  if (params.status) query.append('status', params.status);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  if (params.mine) query.append('mine', 'true');
  const qs = query.toString();
  const res = await apiClient.get(`/api/staff/orders${qs ? `?${qs}` : ''}`);
  return res.data;
}
