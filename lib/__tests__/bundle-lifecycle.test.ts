import { describe, expect, it, vi } from "vitest";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

describe("lifecycle voucher BUNDLE theo order", () => {
  it("hủy order trả voucher và chuyển promotion application sang CANCELLED", async () => {
    const voucherUpdate = vi.fn().mockResolvedValue({});
    const applicationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      orderDiscountVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      orderItemAddonVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      order: { findUnique: vi.fn().mockResolvedValue({ freeship_voucher_id: null }) },
      orderBundleApplication: {
        findUnique: vi.fn().mockResolvedValue({ voucher_id: "bundle-voucher" }),
        updateMany: applicationUpdateMany,
      },
      voucher: {
        findUnique: vi.fn().mockResolvedValue({ status: "RESERVED", expires_at: null }),
        update: voucherUpdate,
      },
      pointsLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      user: { findUnique: vi.fn(), update: vi.fn() },
    };

    await restoreVouchersOnCancel(tx as never, "order-1");

    expect(voucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bundle-voucher" }, data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(applicationUpdateMany).toHaveBeenCalledWith({
      where: { order_id: "order-1", status: { in: ["RESERVED", "REDEEMED"] } },
      data: { status: "CANCELLED" },
    });
  });

  it("hủy order khôi phục ITEM voucher gắn trên extras line", async () => {
    const voucherUpdate = vi.fn().mockResolvedValue({});
    const tx = {
      orderDiscountVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      orderItem: {
        findMany: vi.fn().mockResolvedValue([
          { product_voucher_id: null, item_voucher_id: "item-voucher" },
        ]),
      },
      orderItemAddonVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      order: { findUnique: vi.fn().mockResolvedValue({ freeship_voucher_id: null }) },
      voucher: {
        findUnique: vi.fn().mockResolvedValue({ status: "RESERVED", expires_at: null }),
        update: voucherUpdate,
      },
      pointsLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
      user: { findUnique: vi.fn(), update: vi.fn() },
    };

    await restoreVouchersOnCancel(tx as never, "order-with-extra");

    expect(voucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-voucher" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });
});
