import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";
import type { CartItem } from "@/src/lib/types/cart";
import type { createOrder } from "@/src/services/orderService";

// ── Khai báo mock trước import ──────────────────────────────────
const { mockCreateOrder, mockAddBusinessBreadcrumb } = vi.hoisted(() => ({
  mockCreateOrder: vi.fn(),
  mockAddBusinessBreadcrumb: vi.fn(),
}));

vi.mock("@/src/services/orderService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/services/orderService")>();
  return {
    ...actual,
    createOrder: mockCreateOrder,
  };
});

vi.mock("@/src/lib/observability", () => ({
  addBusinessBreadcrumb: (...args: unknown[]) => mockAddBusinessBreadcrumb(...args),
}));

import { useCheckout } from "@/src/hooks/useCheckout";

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children, client = createQueryClient() }: { children: React.ReactNode, client?: QueryClient }) => (
  <QueryClientProvider client={client}>
    {children}
  </QueryClientProvider>
);

describe("useCheckout Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi service createOrder và invalidate cache thành công", async () => {
    mockCreateOrder.mockResolvedValueOnce({ success: true });
    const queryClient = createQueryClient();
    const mockInvalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCheckout(), { 
      wrapper: ({ children }) => wrapper({ children, client: queryClient })
    });

    const mockItems: CartItem[] = [{
      cartId: "cart-1",
      menuItemId: "item-1",
      name: "Matcha Latte",
      category: "latte",
      imageUrl: null,
      size: "MEDIUM",
      unitPrice: 50_000,
      quantity: 1,
      sweetness: "FULL",
      iceOption: "NORMAL",
      coldwhisk: false,
      note: "",
      selectedOptionIds: [],
      quantityMap: {},
      addonsPrice: 0,
      addonPrices: {},
      quantityAddonOptions: [],
      clientPriceVnd: 50_000,
      originalClientPriceVnd: 50_000,
    }];
    const mockOptions: NonNullable<Parameters<typeof createOrder>[1]> = {
      orderType: "PICKUP",
    };

    let res;
    await act(async () => {
      res = await result.current.mutateAsync({ items: mockItems, options: mockOptions });
    });

    expect(res).toEqual({ success: true });
    expect(mockCreateOrder).toHaveBeenCalledWith(mockItems, mockOptions);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "points"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "orders"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "vouchers"] });
    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("checkout.started", {
      item_count: 1,
      order_type: "PICKUP",
    });
    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("order.created", {
      item_count: 1,
      order_type: "PICKUP",
    });
  });

  it("throw error nếu checkout thất bại", async () => {
    const testError = new Error("Lỗi đặt hàng");
    mockCreateOrder.mockRejectedValueOnce(testError);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ items: [], options: {} });
      })
    ).rejects.toThrow("Lỗi đặt hàng");
    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("order.failed", {
      item_count: 0,
      order_type: "UNKNOWN",
    });
  });
});
