import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { adminCancelOrder, confirmPayment } from "@/src/services/adminOrderService";

describe("adminOrderService — xác nhận phương thức thanh toán", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trả snapshot điều chỉnh điểm để Admin biết voucher nào bị thu hồi theo số lượng", async () => {
    const result = {
      id: "counter-1", status: "CANCELLED",
      cancellation_adjustment: { revoked_voucher_count: 2, refunded_points: 15, reversed_points: 12 },
    };
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: result } });

    expect(await adminCancelOrder("counter-1")).toEqual(result);
    expect(apiClient.patch).toHaveBeenCalledWith("/api/staff/orders/counter-1", { status: "CANCELLED" });
  });

  it("giữ nguyên status, code và details của lỗi hủy đơn từ backend", async () => {
    vi.mocked(apiClient.patch).mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 422"), {
      isAxiosError: true,
      response: { status: 422, data: {
        error: "Insufficient reversible points", code: "BUSINESS_RULE_VIOLATION",
        details: { reason: "INSUFFICIENT_REVERSIBLE_POINTS" },
      } },
    }));
    await expect(adminCancelOrder("counter-1")).rejects.toMatchObject({
      name: "AdminOrderServiceError",
      message: "Insufficient reversible points",
      status: 422,
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "INSUFFICIENT_REVERSIBLE_POINTS" },
    });
  });

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
