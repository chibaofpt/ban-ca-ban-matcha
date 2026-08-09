import { beforeEach, describe, expect, it } from "vitest";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";

const pendingPayment = {
  id: "order-payment-1",
  status: "PENDING" as const,
  order_type: "COUNTER" as const,
  payment_method: "BANK_TRANSFER" as const,
  order_code: "BCBM-PAY001",
  auto_cancel_at: "2026-08-09T10:20:00.000Z",
  payment_qr_url: "https://img.vietqr.io/payment.jpg",
  subtotal_vnd: 69_000,
  total_voucher_discount_vnd: 0,
  total_vnd: 69_000,
  shipping_fee_vnd: 0,
  freeship_discount_vnd: 0,
  grand_total_vnd: 69_000,
  points_earned: null,
  skipped_vouchers: [],
};

describe("staff cart — giao dịch chuyển khoản đang chờ", () => {
  beforeEach(() => {
    useStaffCartStore.setState({
      items: [],
      customerInfo: null,
      discountVoucher: null,
      selectedDiscountIds: [],
      pendingPayment: null,
    });
  });

  it("lưu đơn PENDING để khôi phục sau reload", () => {
    useStaffCartStore.getState().setPendingPayment(pendingPayment);

    expect(useStaffCartStore.getState().pendingPayment).toEqual(pendingPayment);
  });

  it("huỷ giao dịch chỉ xoá pending state và giữ nguyên giỏ", () => {
    useStaffCartStore.setState({
      items: [{ cartId: "cart-1" } as never],
      pendingPayment,
    });

    useStaffCartStore.getState().clearPendingPayment();

    expect(useStaffCartStore.getState().pendingPayment).toBeNull();
    expect(useStaffCartStore.getState().items).toHaveLength(1);
  });

  it("xác nhận thành công clear cả giỏ và pending state", () => {
    useStaffCartStore.setState({
      items: [{ cartId: "cart-1" } as never],
      pendingPayment,
    });

    useStaffCartStore.getState().clearCart();

    expect(useStaffCartStore.getState().items).toEqual([]);
    expect(useStaffCartStore.getState().pendingPayment).toBeNull();
  });
});
