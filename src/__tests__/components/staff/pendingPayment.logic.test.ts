import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  usePendingCounterTransfers,
  useStaffCounterCheckoutPayment,
} from "@/src/lib/hooks/useCounterTransferPayment";
import type { StaffOrderResult } from "@/src/lib/types/order";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => vi.useRealTimers());

const pendingPayment: StaffOrderResult = {
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

describe("checkout tại quầy — tách giỏ khỏi giao dịch chuyển khoản", () => {
  it("bàn giao đơn chuyển khoản cho launcher và reset phương thức", () => {
    const onPendingCreated = vi.fn();
    const onCheckoutCompleted = vi.fn();
    const { result } = renderHook(() =>
      useStaffCounterCheckoutPayment({ onPendingCreated, onCheckoutCompleted }),
    );

    act(() => {
      result.current.setPaymentMethod("BANK_TRANSFER");
      result.current.handleOrderCreated(pendingPayment);
    });

    expect(onPendingCreated).toHaveBeenCalledWith(pendingPayment);
    expect(onCheckoutCompleted).not.toHaveBeenCalled();
    expect(result.current.paymentMethod).toBe("CASH");
  });

  it("giữ luồng CASH hoàn tất ngay như cũ", () => {
    const onPendingCreated = vi.fn();
    const onCheckoutCompleted = vi.fn();
    const { result } = renderHook(() =>
      useStaffCounterCheckoutPayment({ onPendingCreated, onCheckoutCompleted }),
    );

    act(() => {
      result.current.handleOrderCreated({
        ...pendingPayment,
        status: "COMPLETED",
        payment_method: "CASH",
        order_code: null,
        auto_cancel_at: null,
        payment_qr_url: null,
      });
    });

    expect(onCheckoutCompleted).toHaveBeenCalledOnce();
    expect(onPendingCreated).not.toHaveBeenCalled();
  });

  it("chỉ mở QR sau khi cart drawer đã có thời gian đóng", () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(
      () => usePendingCounterTransfers({
        fetchOrders: vi.fn().mockResolvedValue({ data: [] }),
        updateStatus: vi.fn(),
      }),
      { wrapper },
    );

    act(() => result.current.selectPaymentAfterSurfaceClose(pendingPayment));
    expect(result.current.activePayment).toBeNull();

    act(() => vi.advanceTimersByTime(250));
    expect(result.current.activePayment).toEqual(pendingPayment);
  });
});
