import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import React from "react";

// ── Khai báo mock trước import ──────────────────────────────────
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: mockGet,
  },
}));

import {
  useCustomerPoints,
  useCustomerPointsHistory,
} from "@/src/hooks/useCustomerPoints";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
);

describe("useCustomerPoints — React Query Hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
  });

  it("gọi API và trả về điểm cá thành công", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          points_balance: 1500,
          events: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      },
    });

    const { result } = renderHook(() => useCustomerPoints(), { wrapper });

    // Ban đầu là loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGet).toHaveBeenCalledWith("/api/profile/points", {
      params: { page: 1, limit: 10 },
    });
    expect(result.current.data).toBe(1500);
  });

  it("báo lỗi nếu API thất bại", async () => {
    mockGet.mockRejectedValueOnce(new Error("API Error"));

    const { result } = renderHook(() => useCustomerPoints(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.data).toBeUndefined();
  });

  it("history hook truyền limit và tách cache theo page limit", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          points_balance: 20,
          events: [],
          meta: { total: 0, page: 2, limit: 5, totalPages: 1 },
        },
      },
    });

    const { result } = renderHook(() => useCustomerPointsHistory(2, 5), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/api/profile/points", {
      params: { page: 2, limit: 5 },
    });
    expect(
      queryClient.getQueryData([
        "customer",
        "points",
        { page: 2, limit: 5 },
      ]),
    ).toBeDefined();
  });

  it("balance và history trang đầu dùng chung một request", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          points_balance: 20,
          events: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      },
    });

    const { result } = renderHook(
      () => ({
        balance: useCustomerPoints(),
        history: useCustomerPointsHistory(1, 10),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.history.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
