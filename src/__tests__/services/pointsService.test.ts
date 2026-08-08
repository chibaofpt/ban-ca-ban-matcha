import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@/src/lib/api/client", () => ({
  apiClient: { get: mockGet },
}));

import { getCustomerPoints } from "@/src/services/pointsService";

describe("pointsService — lịch sử điểm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gửi page và limit qua API client", async () => {
    const data = {
      points_balance: 42,
      events: [],
      meta: { total: 0, page: 2, limit: 10, totalPages: 1 },
    };
    mockGet.mockResolvedValue({ data: { data } });

    await expect(getCustomerPoints(2, 10)).resolves.toEqual(data);
    expect(mockGet).toHaveBeenCalledWith("/api/profile/points", {
      params: { page: 2, limit: 10 },
    });
  });

  it("mặc định lấy trang 1 với 10 giao dịch", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          points_balance: 0,
          events: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        },
      },
    });

    await getCustomerPoints();

    expect(mockGet).toHaveBeenCalledWith("/api/profile/points", {
      params: { page: 1, limit: 10 },
    });
  });
});
