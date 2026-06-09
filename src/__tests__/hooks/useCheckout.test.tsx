import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

// ── Khai báo mock trước import ──────────────────────────────────
const mockCreateOrder = vi.fn();

vi.mock("@/src/services/orderService", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    createOrder: (...args: any[]) => mockCreateOrder(...args),
  };
});

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

    const mockItems = [{ id: 1 }];
    const mockOptions = { orderType: "PICKUP" };

    let res;
    await act(async () => {
      res = await result.current.mutateAsync({ items: mockItems as any, options: mockOptions as any });
    });

    expect(res).toEqual({ success: true });
    expect(mockCreateOrder).toHaveBeenCalledWith(mockItems, mockOptions);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "points"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "orders"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "vouchers"] });
  });

  it("throw error nếu checkout thất bại", async () => {
    const testError = new Error("Lỗi đặt hàng");
    mockCreateOrder.mockRejectedValueOnce(testError);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ items: [], options: {} as any });
      })
    ).rejects.toThrow("Lỗi đặt hàng");
  });
});
