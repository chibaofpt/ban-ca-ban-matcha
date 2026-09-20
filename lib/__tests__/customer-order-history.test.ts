import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderCount: vi.fn(),
  orderFindMany: vi.fn(),
  transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { count: mocks.orderCount, findMany: mocks.orderFindMany },
    $transaction: mocks.transaction,
  },
}));

import {
  calculateOrderPointsAwarded,
  getCustomerOrderHistory,
} from "@/lib/customerOrderHistory";

describe("customer order history points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cộng điểm mua hàng và điểm dư voucher thành tổng thực nhận", () => {
    expect(calculateOrderPointsAwarded([
      { reason: "order_complete", delta: 5 },
      { reason: "voucher_surplus", delta: 2 },
      { reason: "manual_admin_adjustment", delta: 9 },
    ])).toBe(7);
  });

  it("phản ánh các log hoàn tác và không hiển thị điểm âm", () => {
    expect(calculateOrderPointsAwarded([
      { reason: "order_complete", delta: 5 },
      { reason: "voucher_surplus", delta: 2 },
      { reason: "order_complete_reversed", delta: -5 },
      { reason: "voucher_surplus_reversed", delta: -2 },
    ])).toBe(0);
  });

  it("giữ điểm gốc của đơn hoàn tất legacy và cộng điểm dư sau hoàn tác", async () => {
    mocks.orderCount.mockResolvedValue(1);
    mocks.orderFindMany.mockResolvedValue([{
      id: "legacy-completed-order",
      status: "COMPLETED",
      order_type: "PICKUP",
      order_code: "BCBM-LEGACY",
      total_vnd: 70_000,
      grand_total_vnd: 70_000,
      points_earned: 7,
      user_id: "customer-id",
      handled_by: null,
      payment_confirmed_by: null,
      freeship_voucher_id: null,
      discountVouchers: [],
      pointsLogs: [
        { reason: "voucher_surplus", delta: 2 },
        { reason: "voucher_surplus_reversed", delta: -1 },
      ],
      items: [],
    }]);

    const response = await getCustomerOrderHistory("customer-id", 1, 10);
    const body = await response.json() as { data: Array<{ points_earned: number }> };

    expect(body.data[0]?.points_earned).toBe(8);
  });
});
