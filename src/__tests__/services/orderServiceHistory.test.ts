import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from "@/src/lib/api/client";
import { fetchCustomerOrders } from "@/src/services/orderService";

describe("fetchCustomerOrders — bộ lọc lịch sử đơn khách", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["active", "delivery", "pickup", "cancelled"] as const)(
    "gửi bộ lọc %s và giữ dữ liệu cùng tổng số trang từ server",
    async (statusFilter) => {
      const response = { data: [], meta: { total: 6, page: 2, totalPages: 2 } };
      vi.mocked(apiClient.get).mockResolvedValue({ data: response });

      const result = await fetchCustomerOrders({ page: 2, limit: 5, statusFilter });

      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/orders?page=2&limit=5&status=" + statusFilter,
      );
      expect(result).toEqual(response);
    },
  );

  it("giữ request không bộ lọc tương thích với consumer cũ", async () => {
    const response = { data: [], meta: { total: 0, page: 1, totalPages: 0 } };
    vi.mocked(apiClient.get).mockResolvedValue({ data: response });

    expect(await fetchCustomerOrders()).toEqual(response);
    expect(apiClient.get).toHaveBeenCalledWith("/api/orders");
  });
});
