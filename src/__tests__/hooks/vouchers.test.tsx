import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

// ── Khai báo mock trước import ──────────────────────────────────
const { mockListMyVouchers, mockListPackages } = vi.hoisted(() => ({
  mockListMyVouchers: vi.fn(),
  mockListPackages: vi.fn(),
}));

vi.mock("@/src/services/customerVoucherService", () => ({
  listMyVouchers: mockListMyVouchers,
  listActiveVoucherPackages: mockListPackages,
}));

import { useCustomerVouchers } from "@/src/hooks/useCustomerVouchers";
import { useVoucherPackages } from "@/src/hooks/useVoucherPackages";

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
});
