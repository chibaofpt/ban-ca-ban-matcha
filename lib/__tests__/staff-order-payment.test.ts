import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  buildVietQRUrl: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: mocks.orderFindUnique } },
}));

vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: mocks.buildVietQRUrl,
}));

import {
  getAuthorizedStaffPaymentOrder,
  getPendingPaymentQrUrl,
  getPendingPaymentWhere,
} from "@/lib/orders/staffOrderPaymentRead";
import { StaffPaymentAccessError } from "@/lib/orders/staffOrderPayment";

describe("staff order payment read workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chỉ tạo QR cho đơn chuyển khoản đang chờ và đóng an toàn khi adapter lỗi", () => {
    const pendingOrder = {
      status: "PENDING" as const,
      payment_method: "BANK_TRANSFER" as const,
      order_code: "BCBM-001",
      grand_total_vnd: 45_000,
    };
    mocks.buildVietQRUrl
      .mockReturnValueOnce("https://qr.example/BCBM-001")
      .mockImplementationOnce(() => { throw new Error("invalid config"); });

    expect(getPendingPaymentQrUrl({ ...pendingOrder, status: "COMPLETED" })).toBeNull();
    expect(getPendingPaymentQrUrl(pendingOrder)).toBe("https://qr.example/BCBM-001");
    expect(getPendingPaymentQrUrl(pendingOrder)).toBeNull();
    expect(mocks.buildVietQRUrl).toHaveBeenNthCalledWith(1, {
      amount: 45_000,
      orderCode: "BCBM-001",
    });
  });

  it("giữ bộ lọc pending theo vai trò và tùy chọn mine", () => {
    const ownedPending = {
      status: "PENDING",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      handled_by: "staff-1",
    };

    expect(getPendingPaymentWhere("STAFF", "staff-1")).toEqual(ownedPending);
    expect(getPendingPaymentWhere("ADMIN", "staff-1", true)).toEqual(ownedPending);
    expect(getPendingPaymentWhere("ADMIN", "admin-1")).toEqual({ status: "PENDING" });
  });

  it("giữ cùng lớp lỗi khi không tìm thấy hoặc Staff đọc đơn không thuộc mình", async () => {
    mocks.orderFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "order-1",
      status: "PENDING",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      order_code: "BCBM-001",
      auto_cancel_at: null,
      subtotal_vnd: 45_000,
      total_voucher_discount_vnd: 0,
      total_vnd: 45_000,
      shipping_fee_vnd: 0,
      freeship_discount_vnd: 0,
      grand_total_vnd: 45_000,
      points_earned: 0,
      handled_by: "staff-2",
      created_at: new Date("2026-09-27T01:00:00.000Z"),
    });

    const notFound = await getAuthorizedStaffPaymentOrder(
      "missing-order",
      { id: "staff-1", role: "STAFF" },
    ).catch((error: unknown) => error);
    const forbidden = await getAuthorizedStaffPaymentOrder(
      "order-1",
      { id: "staff-1", role: "STAFF" },
    ).catch((error: unknown) => error);

    expect(notFound).toBeInstanceOf(StaffPaymentAccessError);
    expect(notFound).toMatchObject({ code: "NOT_FOUND", message: "Order not found" });
    expect(forbidden).toBeInstanceOf(StaffPaymentAccessError);
    expect(forbidden).toMatchObject({ code: "FORBIDDEN", message: "Forbidden" });
  });

  it("ánh xạ đầy đủ snapshot thanh toán cho phiên được phép", async () => {
    const autoCancelAt = new Date("2026-09-27T01:20:00.000Z");
    const createdAt = new Date("2026-09-27T01:00:00.000Z");
    mocks.orderFindUnique.mockResolvedValue({
      id: "order-1",
      status: "PENDING",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      order_code: "BCBM-001",
      auto_cancel_at: autoCancelAt,
      subtotal_vnd: 50_000,
      total_voucher_discount_vnd: 5_000,
      total_vnd: 45_000,
      shipping_fee_vnd: 0,
      freeship_discount_vnd: 0,
      grand_total_vnd: 45_000,
      points_earned: 4,
      handled_by: "staff-1",
      created_at: createdAt,
    });
    mocks.buildVietQRUrl.mockReturnValue("https://qr.example/BCBM-001");

    await expect(getAuthorizedStaffPaymentOrder(
      "order-1",
      { id: "admin-1", role: "ADMIN" },
    )).resolves.toEqual({
      id: "order-1",
      status: "PENDING",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      order_code: "BCBM-001",
      auto_cancel_at: autoCancelAt.toISOString(),
      payment_qr_url: "https://qr.example/BCBM-001",
      subtotal_vnd: 50_000,
      total_voucher_discount_vnd: 5_000,
      total_vnd: 45_000,
      shipping_fee_vnd: 0,
      freeship_discount_vnd: 0,
      grand_total_vnd: 45_000,
      points_earned: 4,
      skipped_vouchers: [],
      created_at: createdAt.toISOString(),
    });
    expect(mocks.orderFindUnique).toHaveBeenCalledWith({
      where: { id: "order-1" },
      select: {
        id: true,
        status: true,
        order_type: true,
        payment_method: true,
        order_code: true,
        auto_cancel_at: true,
        subtotal_vnd: true,
        total_voucher_discount_vnd: true,
        total_vnd: true,
        shipping_fee_vnd: true,
        freeship_discount_vnd: true,
        grand_total_vnd: true,
        points_earned: true,
        handled_by: true,
        created_at: true,
      },
    });
  });
});
