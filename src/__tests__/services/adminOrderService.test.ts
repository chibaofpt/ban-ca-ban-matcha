import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { confirmPayment } from "@/src/services/adminOrderService";

describe("adminOrderService — xác nhận phương thức thanh toán", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hoàn tất trực tiếp chuyển khoản COUNTER qua staff status route", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: {} } });

    await confirmPayment("counter-order-1", "COUNTER", "BANK_TRANSFER");

    expect(apiClient.patch).toHaveBeenCalledWith("/api/staff/orders/counter-order-1", {
      status: "COMPLETED",
    });
  });

  it("giữ nguyên confirm-payment route cho đơn online", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: {} } });

    await confirmPayment("pickup-order-1", "PICKUP", "BANK_TRANSFER");

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/api/admin/orders/pickup-order-1/confirm-payment",
    );
  });

  it("giữ tương thích caller cũ chỉ truyền orderId", async () => {
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: {} } });

    await confirmPayment("legacy-order-1");

    expect(apiClient.patch).toHaveBeenCalledWith(
      "/api/admin/orders/legacy-order-1/confirm-payment",
    );
  });
});
