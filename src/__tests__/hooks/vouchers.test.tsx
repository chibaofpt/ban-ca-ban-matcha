import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

// ── Khai báo mock trước import ──────────────────────────────────
const { mockListMyVouchers, mockListPackages, mockExchangeVoucher } = vi.hoisted(() => ({
  mockListMyVouchers: vi.fn(),
  mockListPackages: vi.fn(),
  mockExchangeVoucher: vi.fn(),
}));

vi.mock("@/src/services/customerVoucherService", () => ({
  listMyVouchers: mockListMyVouchers,
  listActiveVoucherPackages: mockListPackages,
  exchangeVoucher: mockExchangeVoucher,
}));

import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";
import { useExchangeVoucher } from "@/src/hooks/useExchangeVoucher";

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

describe("Voucher Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCustomerVouchers", () => {
    it("fetch thành công danh sách voucher", async () => {
      mockListMyVouchers.mockResolvedValueOnce([{ id: "v1" }]);
      const { result } = renderHook(() => useCustomerVouchers(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([{ id: "v1" }]);
    });
  });

  describe("useVoucherPackages", () => {
    it("fetch thành công danh sách packages", async () => {
      mockListPackages.mockResolvedValueOnce([{ id: "p1" }]);
      const { result } = renderHook(() => useVoucherPackages(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([{ id: "p1" }]);
    });
  });

  describe("useExchangeVoucher", () => {
    it("thực hiện exchange và invalidate cache", async () => {
      mockExchangeVoucher.mockResolvedValueOnce(undefined);
      const queryClient = createQueryClient();
      const mockInvalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useExchangeVoucher(), { 
        wrapper: ({ children }) => wrapper({ children, client: queryClient })
      });

      act(() => {
        result.current.mutate("p1");
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockExchangeVoucher).toHaveBeenCalledWith("p1");
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "points"] });
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "vouchers"] });
    });
  });
});
