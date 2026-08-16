import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingCounterTransfersLauncher } from "@/src/components/staff/PendingCounterTransfersLauncher";
import type { StaffOrderResult } from "@/src/lib/types/order";

const payment: StaffOrderResult = {
  id: "order-payment-1",
  status: "PENDING",
  order_type: "COUNTER",
  payment_method: "BANK_TRANSFER",
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

describe("PendingCounterTransfersLauncher — mở lại QR chuyển khoản", () => {
  it("không hiện khi không có giao dịch đang chờ", () => {
    render(<PendingCounterTransfersLauncher payments={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Chờ chuyển khoản/ })).toBeNull();
  });

  it("mở thẳng QR khi chỉ có một giao dịch", () => {
    const onSelect = vi.fn();
    render(<PendingCounterTransfersLauncher payments={[payment]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Chờ chuyển khoản/ }));

    expect(onSelect).toHaveBeenCalledWith(payment);
  });

  it("mở bottom sheet danh sách khi có từ hai giao dịch", () => {
    render(
      <PendingCounterTransfersLauncher
        payments={[payment, { ...payment, id: "order-payment-2", order_code: "BCBM-PAY002" }]}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Chờ chuyển khoản/ }));

    expect(screen.getByRole("dialog", { name: "Chọn đơn chuyển khoản" })).toBeTruthy();
    expect(screen.getByText("BCBM-PAY001")).toBeTruthy();
    expect(screen.getByText("BCBM-PAY002")).toBeTruthy();
  });
});
