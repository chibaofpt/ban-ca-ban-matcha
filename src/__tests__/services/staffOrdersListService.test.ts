import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

import { fetchOrdersList } from "@/src/services/staffOrdersListService";

describe("staffOrdersListService — danh sách chuyển khoản của người tạo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [], meta: { total: 0, page: 1, totalPages: 0 } } });
  });

  it("gửi mine=true cùng bộ lọc COUNTER PENDING", async () => {
    await fetchOrdersList({
      order_type: "COUNTER",
      status: "PENDING",
      mine: true,
      page: 1,
      limit: 100,
    });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/staff/orders?order_type=COUNTER&status=PENDING&page=1&limit=100&mine=true",
    );
  });
});
