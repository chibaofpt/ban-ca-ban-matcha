import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(), orderFindFirst: vi.fn(), orderFindMany: vi.fn(), orderCount: vi.fn(), voucherFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: mocks.userFindFirst },
  order: { findFirst: mocks.orderFindFirst, findMany: mocks.orderFindMany, count: mocks.orderCount },
  voucher: { findMany: mocks.voucherFindMany },
} }));

import { getAdminUserOrder, listAdminUserOrders } from "@/lib/adminUserQueries";

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-id", user_id: "customer-id", order_code: "BCBM-ABC123", status: "COMPLETED", order_type: "PICKUP",
    created_at: new Date("2026-01-01"), delivery_receiver_name: null, delivery_receiver_phone: null,
    delivery_address: null, address: null, subtotal_vnd: 50_000, total_voucher_discount_vnd: 5_000,
    shipping_fee_vnd: 0, freeship_discount_vnd: 0, grand_total_vnd: 45_000, points_earned: null,
    freeship_voucher_id: null, discountVouchers: [], items: [], bundleApplications: [], pointsLogs: [],
    ...overrides,
  };
}

describe("Admin customer order policy", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.userFindFirst.mockResolvedValue({ id: "customer-id" }); });

  it("constrains detail by order and CUSTOMER owner, then emits public voucher names without voucher IDs", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({
      discountVouchers: [{ voucher: { voucher_type: "DISCOUNT", package: { name: "Giảm 5k" } } }],
    }));

    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");

    expect(mocks.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      qr_token: "550e8400-e29b-41d4-a716-446655440000", role: "CUSTOMER",
    } }));
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "550e8400-e29b-41d4-a716-446655440001", user_id: "customer-id",
    } }));
    expect(result?.points_earned).toBeNull();
    expect(JSON.stringify(result)).not.toContain("customer-id");
    expect(JSON.stringify(result)).not.toContain("voucher_id");
    expect(result?.order_vouchers).toEqual([{ name: "Giảm 5k", type: "DISCOUNT" }]);
  });

  it("giữ nguyên loại PRODUCT_DISCOUNT của voucher sản phẩm trong DTO đơn hàng", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({
      order_code: "BCBM-RED001",
      items: [{
        id: "order-item-id", quantity: 1, size: "M", unit_price_vnd: 50_000, addons_price_vnd: 0,
        total_discount_vnd: 5_000, sweetness: null, ice_option: null, coldwhisk: false, note: null,
        menuItem: { id: "menu-item-id", name: "Matcha", category: "matcha", image_url: null },
        selectedPowder: null, milkType: null, addons: [], itemVoucher: null, addonVouchers: [],
        productVoucher: { voucher_type: "PRODUCT_DISCOUNT", package: { name: "Giảm matcha" } },
      }],
    }));

    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");

    expect(result?.order_vouchers).toEqual([{ name: "Giảm matcha", type: "PRODUCT_DISCOUNT" }]);
    expect(JSON.stringify(result?.order_vouchers)).not.toContain("order-item-id");
  });

  it("gộp 7 điểm đơn và 2 điểm dư thành 9 cho cả danh sách lẫn chi tiết", async () => {
    const row = orderRow({ points_earned: 7, pointsLogs: [
      { reason: "order_complete", delta: 7 }, { reason: "voucher_surplus", delta: 2 },
    ] });
    mocks.orderFindFirst.mockResolvedValue(row);
    mocks.orderFindMany.mockResolvedValue([row]);
    mocks.orderCount.mockResolvedValue(1);

    const [detail, list] = await Promise.all([
      getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"),
      listAdminUserOrders("550e8400-e29b-41d4-a716-446655440000", 1),
    ]);

    const expected = { order_points: 7, surplus_points: 2, reversed_points: 0, total_received: 9 };
    expect(detail?.points_breakdown).toEqual(expected);
    expect(list?.items[0]?.points_breakdown).toEqual(expected);
  });

  it("giữ breakdown điểm đơn khi điểm dư bằng 0", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ points_earned: 7, pointsLogs: [{ reason: "order_complete", delta: 7 }] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.points_breakdown).toEqual({ order_points: 7, surplus_points: 0, reversed_points: 0, total_received: 7 });
  });

  it("trả null khi đơn đang chờ và chưa từng được cộng điểm", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ status: "PENDING", points_earned: 0 }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.points_breakdown).toBeNull();
  });

  it("luôn trả null cho đơn chưa hoàn tất dù có điểm hoặc log cũ ở cả list và detail", async () => {
    const unfinished = ["PENDING", "ADMIN_CONFIRMED", "STAFF_DONE"].map((status, index) => orderRow({
      id: `unfinished-${index}`, status, points_earned: 9,
      pointsLogs: [{ reason: "order_complete", delta: 7 }, { reason: "voucher_surplus", delta: 2 }],
    }));
    mocks.orderFindMany.mockResolvedValue(unfinished);
    mocks.orderCount.mockResolvedValue(unfinished.length);
    mocks.orderFindFirst.mockResolvedValueOnce(unfinished[0]).mockResolvedValueOnce(unfinished[1]).mockResolvedValueOnce(unfinished[2]);

    const list = await listAdminUserOrders("550e8400-e29b-41d4-a716-446655440000", 1);
    const details = await Promise.all(unfinished.map((row) => getAdminUserOrder(
      "550e8400-e29b-41d4-a716-446655440000", row.id,
    )));

    expect(list?.items.map((order) => order.points_breakdown)).toEqual([null, null, null]);
    expect(details.map((order) => order?.points_breakdown)).toEqual([null, null, null]);
  });

  it("trả breakdown toàn số 0 cho đơn hoàn tất không có điểm", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ points_earned: 0 }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.points_breakdown).toEqual({ order_points: 0, surplus_points: 0, reversed_points: 0, total_received: 0 });
  });

  it("hiển thị điểm thu hồi của đơn huỷ và không để tổng nhận âm", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ status: "CANCELLED", points_earned: 7, pointsLogs: [
      { reason: "order_complete", delta: 7 }, { reason: "voucher_surplus", delta: 2 },
      { reason: "order_complete_reversed", delta: -7 }, { reason: "voucher_surplus_reversed", delta: -3 },
    ] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.points_breakdown).toEqual({ order_points: 7, surplus_points: 2, reversed_points: 10, total_received: 0 });
  });

  it("không suy diễn điểm legacy cho đơn huỷ không có log lifecycle", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ status: "CANCELLED", points_earned: 8, pointsLogs: [] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.points_breakdown).toBeNull();
  });

  it("chỉ chọn log điểm thuộc lifecycle đơn, loại mua và hoàn voucher", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ points_earned: 4, pointsLogs: [
      { reason: "order_complete", delta: 4 }, { reason: "voucher_purchase", delta: -100 },
      { reason: "voucher_refund", delta: 100 }, { reason: "manual", delta: 500 },
    ] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    const include = mocks.orderFindFirst.mock.calls[0]?.[0]?.include;
    expect(include.pointsLogs.where.reason.in).toEqual([
      "order_complete", "voucher_surplus", "order_complete_reversed", "voucher_surplus_reversed",
    ]);
    expect(include.pointsLogs.where.reason.in).not.toEqual(expect.arrayContaining(["voucher_purchase", "voucher_refund", "manual"]));
    expect(result?.points_breakdown).toEqual({ order_points: 4, surplus_points: 0, reversed_points: 0, total_received: 4 });
  });

  it("chỉ fallback points_earned khi không có log order_complete", async () => {
    mocks.orderFindFirst
      .mockResolvedValueOnce(orderRow({ points_earned: 6, pointsLogs: [] }))
      .mockResolvedValueOnce(orderRow({ points_earned: 6, pointsLogs: [{ reason: "order_complete", delta: -2 }] }));
    const withoutLog = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    const malformedLog = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(withoutLog?.points_breakdown?.order_points).toBe(6);
    expect(malformedLog?.points_breakdown?.order_points).toBe(0);
  });

  it("map parent order item cho reward addon của bundle", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ bundleApplications: [{
      id: "bundle-app", status: "RESERVED", voucher: { voucher_type: "BUNDLE", package: { name: "Combo đôi" } },
      qualifiers: [{ order_item_id: "qualifier-item", quantity: 1 }],
      rewards: [{ order_item_id: null, quantity: 1, discount_vnd: 10_000,
        orderItemAddon: { order_item_id: "parent-item", addonOption: { label: "Trân châu" } } }],
    }] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.bundle_applications[0]?.rewards[0]).toEqual(expect.objectContaining({
      order_item_id: null, parent_order_item_id: "parent-item", addon_label: "Trân châu",
    }));
  });

  it("tính và clamp line_payable_vnd trong mapper server", async () => {
    mocks.orderFindFirst.mockResolvedValue(orderRow({ items: [{
      id: "discounted-item", quantity: 1, size: "M", unit_price_vnd: 40_000, addons_price_vnd: 5_000,
      total_discount_vnd: 50_000, sweetness: "HALF", ice_option: "NORMAL", coldwhisk: false, note: null,
      menuItem: { id: "menu-item-id", name: "Matcha", category: "matcha", image_url: null },
      selectedPowder: null, milkType: null, addons: [], itemVoucher: null, addonVouchers: [], productVoucher: null,
    }] }));
    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");
    expect(result?.items[0]).toEqual(expect.objectContaining({ line_total_vnd: 45_000, line_payable_vnd: 0 }));
  });
});
