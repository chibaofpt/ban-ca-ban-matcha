import { apiClient } from "@/src/lib/api/client";
import type { CartItem } from "@/src/lib/types/cart";

export interface CreateOrderPayload {
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
    selected_powder_id?: string;
    selected_milk_type_id?: string;
    client_price_vnd: number;
  }[];
  voucher_id?: string;
  pickup_time?: string;
  note?: string;
}

export interface CreateOrderResult {
  id: string;
  status: string;
  total_vnd: number;
  pickup_time: string | null;
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
    ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
    ...(c.selectedMilkTypeId ? { selected_milk_type_id: c.selectedMilkTypeId } : {}),
    client_price_vnd: c.clientPriceVnd,
  }));
}

/**
 * Submits the customer's cart as a new order to POST /api/orders.
 * Throws PriceChangedError on 409 PRICE_CHANGED.
 * Throws Error with message on other failures.
 */
export async function createOrder(
  cart: CartItem[],
  options?: { voucherId?: string; pickupTime?: string; note?: string }
): Promise<CreateOrderResult> {
  const payload: CreateOrderPayload = {
    items: buildPayloadItems(cart),
    ...(options?.voucherId ? { voucher_id: options.voucherId } : {}),
    ...(options?.pickupTime ? { pickup_time: options.pickupTime } : {}),
    ...(options?.note ? { note: options.note } : {}),
  };

  try {
    const res = await apiClient.post<{ data: CreateOrderResult }>("/api/orders", payload);
    return res.data.data;
  } catch (err: unknown) {
    // Check for axios error with response
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
      // Other API errors — re-throw with server message
      throw new Error(response.data.error ?? "Đặt hàng thất bại");
    }
    throw new Error("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
  }
}
