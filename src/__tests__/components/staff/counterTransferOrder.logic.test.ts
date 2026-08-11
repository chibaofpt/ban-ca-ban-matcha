import { describe, expect, it } from "vitest";
import {
  collectPendingCounterTransfers,
  getPendingTransferLaunchMode,
  resolveOrderPaymentMethod,
  toCounterTransferPayment,
} from "@/src/lib/utils/counterTransferOrder";

const pendingOrder = {
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
};

describe("mapping giao dịch chuyển khoản tại quầy", () => {
  it("giữ payment_method từ API khi đã có", () => {
    expect(resolveOrderPaymentMethod("COUNTER", "BANK_TRANSFER")).toBe("BANK_TRANSFER");
  });

  it("fallback dữ liệu cũ: COUNTER là CASH, online là BANK_TRANSFER", () => {
    expect(resolveOrderPaymentMethod("COUNTER", undefined)).toBe("CASH");
    expect(resolveOrderPaymentMethod("PICKUP", undefined)).toBe("BANK_TRANSFER");
    expect(resolveOrderPaymentMethod("DELIVERY", undefined)).toBe("BANK_TRANSFER");
  });

  it("tạo snapshot modal khi đủ dữ liệu QR", () => {
    expect(toCounterTransferPayment(pendingOrder)).toEqual({
      ...pendingOrder,
      points_earned: null,
      skipped_vouchers: [],
    });
  });

  it("không mở modal nếu không phải chuyển khoản tại quầy PENDING", () => {
    expect(toCounterTransferPayment({ ...pendingOrder, status: "COMPLETED" })).toBeNull();
    expect(toCounterTransferPayment({ ...pendingOrder, payment_method: "CASH" })).toBeNull();
  });

  it("không mở modal nếu thiếu QR, mã đơn hoặc hạn thanh toán", () => {
    expect(toCounterTransferPayment({ ...pendingOrder, payment_qr_url: null })).toBeNull();
    expect(toCounterTransferPayment({ ...pendingOrder, order_code: null })).toBeNull();
    expect(toCounterTransferPayment({ ...pendingOrder, auto_cancel_at: null })).toBeNull();
  });

  it("chỉ giữ các giao dịch COUNTER BANK_TRANSFER PENDING hợp lệ", () => {
    const result = collectPendingCounterTransfers([
      pendingOrder,
      { ...pendingOrder, id: "cash", payment_method: "CASH" as const },
      { ...pendingOrder, id: "done", status: "COMPLETED" as const },
      { ...pendingOrder, id: "missing-qr", payment_qr_url: null },
    ]);

    expect(result.map((order) => order.id)).toEqual(["order-payment-1"]);
  });

  it("chọn đúng chế độ launcher cho 0, 1 và nhiều giao dịch", () => {
    expect(getPendingTransferLaunchMode(0)).toBe("HIDDEN");
    expect(getPendingTransferLaunchMode(1)).toBe("DIRECT");
    expect(getPendingTransferLaunchMode(2)).toBe("LIST");
  });
});
