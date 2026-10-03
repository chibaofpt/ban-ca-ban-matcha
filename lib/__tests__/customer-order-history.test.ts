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
} from "@/lib/orders/customerOrderHistory";

describe("customer order history points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("khai báo rõ snapshot người nhận bị thiếu trong đơn giao hàng legacy", async () => {
    mocks.orderCount.mockResolvedValue(1);
    mocks.orderFindMany.mockResolvedValue([{
      id: "legacy-delivery", status: "COMPLETED", order_type: "DELIVERY", order_code: null,
      points_earned: 0, items: [], discountVouchers: [], pointsLogs: [],
    }]);
    const result = await getCustomerOrderHistory("customer-id", 1, 10);
    expect(result.data[0]).toMatchObject({
      delivery_receiver_name: null, delivery_receiver_phone: null, delivery_address: null,
    });
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

  it.each([
    ["active", { user_id: "customer-id", NOT: { status: "CANCELLED" } }],
    ["cancelled", { user_id: "customer-id", status: "CANCELLED" }],
  ] as const)("áp dụng bộ lọc %s và giữ nguyên phong bì phân trang", async (statusFilter, where) => {
    mocks.orderCount.mockResolvedValue(21);
    mocks.orderFindMany.mockResolvedValue([]);

    const result = await getCustomerOrderHistory("customer-id", 2, 5, statusFilter);

    expect(result).toEqual({
      data: [],
      meta: { total: 21, page: 2, totalPages: 5 },
    });
    expect(mocks.orderCount).toHaveBeenCalledWith({ where });
    expect(mocks.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where,
      skip: 5,
      take: 5,
      orderBy: { created_at: "desc" },
    }));
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

    const result = await getCustomerOrderHistory("customer-id", 1, 10);

    expect(result.data[0]?.points_earned).toBe(8);
  });
});
