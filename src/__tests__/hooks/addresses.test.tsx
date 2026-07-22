import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

// ── Khai báo mock trước import ──────────────────────────────────
const { mockGetAddresses, mockCreateAddress } = vi.hoisted(() => ({
  mockGetAddresses: vi.fn(),
  mockCreateAddress: vi.fn(),
}));

vi.mock("@/src/services/addressService", () => ({
  addressService: {
    getAddresses: mockGetAddresses,
    createAddress: mockCreateAddress,
  }
}));

import { useCustomerAddresses } from "@/src/hooks/useCustomerAddresses";
import { useCreateAddress } from "@/src/hooks/useCustomerAddresses";

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

describe("Address Hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCustomerAddresses", () => {
    it("fetch thành công danh sách địa chỉ", async () => {
      mockGetAddresses.mockResolvedValueOnce([{ id: "a1" }]);
      const { result } = renderHook(() => useCustomerAddresses(), { wrapper });

      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([{ id: "a1" }]);
    });
  });

  describe("useCreateAddress", () => {
    it("tạo địa chỉ và làm mới cache", async () => {
      mockCreateAddress.mockResolvedValueOnce({ id: "a2" });
      const queryClient = createQueryClient();
      const mockInvalidate = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useCreateAddress(), { 
        wrapper: ({ children }) => wrapper({ children, client: queryClient })
      });

      let response;
      await act(async () => {
        response = await result.current.mutateAsync({
          label: "Home",
          full_address: "123 Test",
          lat: 10,
          lng: 106,
          receiver_name: "Test",
          receiver_phone: "+84901234567",
        });
      });

      expect(response).toEqual({ id: "a2" });
      expect(mockCreateAddress).toHaveBeenCalledWith(expect.objectContaining({ label: "Home" }));
      expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["customer", "addresses"] });
    });
  });
});
