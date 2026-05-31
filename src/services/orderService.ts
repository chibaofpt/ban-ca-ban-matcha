import { apiClient } from "@/src/lib/api/client";
import type { CartItem } from "@/src/lib/types/cart";
import type { CustomerOrderDetail, CreateOrderResult } from "@/src/lib/types/order";

// Re-export for consumers
export type { CreateOrderResult } from "@/src/lib/types/order";

export interface CreateOrderPayload {
  order_type: "PICKUP" | "DELIVERY";
  items: {
    menu_item_id: string;
    quantity: number;
    size: "M" | "L" | "XL";
    sweetness: "NONE" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL";
    ice_option: "NORMAL" | "LESS_ICE" | "NO_ICE" | "SEPARATE_ICE";
    coldwhisk: boolean;
    note?: string;
    addon_option_ids: { option_id: string; quantity: number }[];
    product_voucher_id?: string;
    addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
    selected_powder_id?: string;
    selected_milk_type_id?: string;
    client_price_vnd: number;
  }[];
  discount_voucher_ids: string[];
  pickup_time?: string;
  note?: string;
  delivery_address?: string;
}

export interface PriceConflict {
  menu_item_id: string;
  name: string;
  size: string;
  client_price_vnd: number;
  server_price_vnd: number;
}

export class PriceChangedError extends Error {
  constructor(public readonly conflicts: PriceConflict[]) {
    super("One or more item prices have changed");
    this.name = "PriceChangedError";
  }
}

/** Maps CartItem[] from Zustand store into the POST /api/orders payload items. */
function buildPayloadItems(cart: CartItem[]): CreateOrderPayload["items"] {
  return cart.map((c) => ({
    menu_item_id: c.menuItemId,
    quantity: c.quantity,
    size: c.size,
    sweetness: c.sweetness,
    ice_option: c.iceOption,
    coldwhisk: c.coldwhisk,
    ...(c.note ? { note: c.note } : {}),
    addon_option_ids: [
      ...c.selectedOptionIds.map((id) => ({ option_id: id, quantity: 1 })),
      ...c.quantityAddonOptions,
    ],
    ...(c.productVoucherId ? { product_voucher_id: c.productVoucherId } : {}),
    ...(c.addonVouchers && c.addonVouchers.length > 0
      ? {
          addon_voucher_ids: c.addonVouchers.map((av) => ({
            voucher_id: av.voucherId,
            addon_option_id: av.addonOptionId,
          })),
        }
      : {}),
    ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
    ...(c.selectedMilkTypeId ? { selected_milk_type_id: c.selectedMilkTypeId } : {}),
    client_price_vnd: c.clientPriceVnd,
  }));
}

/**
 * Submits the customer's cart as a new PICKUP order to POST /api/orders.
 * Throws PriceChangedError on 409 PRICE_CHANGED.
 * Throws Error with message on other failures.
 */
export async function createOrder(
  cart: CartItem[],
  options?: {
    orderType?: "PICKUP" | "DELIVERY";
    discountVoucherIds?: string[];
    pickupTime?: string;
    note?: string;
    deliveryAddress?: string;
  }
): Promise<CreateOrderResult> {
  const payload: CreateOrderPayload = {
    order_type: options?.orderType ?? "PICKUP",
    items: buildPayloadItems(cart),
    discount_voucher_ids: options?.discountVoucherIds ?? [],
    ...(options?.pickupTime ? { pickup_time: options.pickupTime } : {}),
    ...(options?.note ? { note: options.note } : {}),
    ...(options?.deliveryAddress ? { delivery_address: options.deliveryAddress } : {}),
  };

  try {
    const res = await apiClient.post<{ data: CreateOrderResult }>("/api/orders", payload);
    return res.data.data;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "response" in err &&
      err.response &&
      typeof err.response === "object" &&
      "data" in err.response
    ) {
      const response = err.response as { status: number; data: { code?: string; details?: { conflicts?: PriceConflict[] }; error?: string } };
      if (response.status === 409 && response.data.code === "PRICE_CHANGED") {
        throw new PriceChangedError(response.data.details?.conflicts ?? []);
      }
      throw new Error(response.data.error ?? "Đặt hàng thất bại");
    }
    throw new Error("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
  }
}

/**
 * Fetches the paginated list of orders for the current customer.
 * Calls GET /api/orders.
 */
export async function fetchCustomerOrders(params?: { page?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.page) query.append('page', params.page.toString());
  if (params?.limit) query.append('limit', params.limit.toString());
  
  const qs = query.toString();
  const res = await apiClient.get(`/api/orders${qs ? `?${qs}` : ''}`);
  return res.data; // { data: [...], meta: { total, page, totalPages } }
}

/**
 * Fetches the current status of a customer order for real-time tracking.
 * Calls GET /api/orders/[id].
 */
export async function fetchOrderDetail(id: string): Promise<CustomerOrderDetail> {
  const res = await apiClient.get<{ data: CustomerOrderDetail }>(`/api/orders/${id}`);
  return res.data.data;
}

/**
 * Customer tự huỷ đơn hàng đang PENDING.
 * Chỉ áp dụng cho đơn PENDING — server sẽ trả 422 nếu đơn đã qua trạng thái này.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  await apiClient.patch(`/api/orders/${orderId}`, { status: "CANCELLED" });
}
