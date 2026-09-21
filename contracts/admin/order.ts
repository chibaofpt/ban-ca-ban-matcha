import type {
  OrderListItem,
  PaginatedResponse,
  PaymentMethod,
} from "../order";

export interface AdminOrderListItem extends OrderListItem {
  handler: { name: string; role: "ADMIN" | "STAFF" } | null;
}

export interface AdminOrderFilters {
  startDate?: string;
  endDate?: string;
  search?: string;
  staffId?: string;
  staffName?: string;
  order_type?: string;
  payment_method?: PaymentMethod;
  status?: string;
  exclude_cancelled?: boolean;
  page?: number;
  limit?: number;
}

export type AdminOrdersResponse = PaginatedResponse<AdminOrderListItem>;
