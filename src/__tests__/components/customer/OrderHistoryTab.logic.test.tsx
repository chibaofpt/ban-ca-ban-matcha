import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderHistoryTab } from "@/src/components/customer/OrderHistoryTab";

afterEach(cleanup);

const ORDER = {
  id: "order-1",
  order_code: "BCBM-ABC123",
  status: "COMPLETED" as const,
  order_type: "PICKUP" as const,
  total_vnd: 150_000,
  shipping_fee_vnd: 0,
  freeship_discount_vnd: 0,
  grand_total_vnd: 150_000,
  subtotal_vnd: 150_000,
  total_voucher_discount_vnd: 0,
  created_at: "2026-08-01T10:00:00.000Z",
  auto_cancel_at: null,
  payment_qr_url: null,
  items: [],
};

describe("OrderHistoryTab — giữ nguyên hành vi lịch sử đơn", () => {
  it("hiển thị mã đơn, điểm dự kiến và tổng thanh toán", () => {
    const view = render(
      <OrderHistoryTab
        orders={[ORDER]}
        isLoading={false}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const text = view.container.textContent ?? "";
    expect(text).toContain("BCBM-ABC123");
    expect(text).toContain("+15 điểm");
    expect(text).toContain("150 ká");
    expect(text).toContain("Đã hoàn thành");
  });

  it("gọi callback đổi trang", () => {
    const onPageChange = vi.fn();
    const view = render(
      <OrderHistoryTab
        orders={[ORDER]}
        isLoading={false}
        page={1}
        totalPages={2}
        onPageChange={onPageChange}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Trang sau" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("hiển thị empty state", () => {
    const view = render(
      <OrderHistoryTab
        orders={[]}
        isLoading={false}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain("Bạn chưa có đơn hàng nào");
  });
});
