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

/** Default controlled filter props for tests that don't focus on filtering. */
const defaultFilterProps = {
  filter: "active" as const,
  onFilterChange: vi.fn(),
};

describe("OrderHistoryTab — giữ nguyên hành vi lịch sử đơn", () => {
  it("hiển thị giảm giá order-level khi card có không quá ba món", () => {
    const view = render(
      <OrderHistoryTab
        orders={[{ ...ORDER, total_voucher_discount_vnd: 10_000,
          discountVouchers: [{ voucher: { package: { name: "Giảm 10K" } } }] }]}
        isLoading={false} page={1} totalPages={1} {...defaultFilterProps}
        onPageChange={vi.fn()} onCancel={vi.fn()} onReorder={vi.fn()}
      />,
    );
    expect(view.container.textContent).toContain("Giảm giá");
    expect(view.container.textContent).toContain("Giảm 10K");
  });
  it("hiển thị mã đơn, điểm dự kiến và tổng thanh toán", () => {
    const view = render(
      <OrderHistoryTab
        orders={[ORDER]}
        isLoading={false}
        page={1}
        totalPages={1}
        {...defaultFilterProps}
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
        {...defaultFilterProps}
        onPageChange={onPageChange}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Trang sau" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("hiển thị empty state khi không có đơn", () => {
    const view = render(
      <OrderHistoryTab
        orders={[]}
        isLoading={false}
        page={1}
        totalPages={1}
        filter="active"
        onFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain("Bạn chưa có đơn hàng nào");
  });

  it("hiển thị empty state đúng khi filter = cancelled", () => {
    const view = render(
      <OrderHistoryTab
        orders={[]}
        isLoading={false}
        page={1}
        totalPages={1}
        filter="cancelled"
        onFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain("Không có đơn nào bị huỷ");
  });

  it("gọi onFilterChange khi bấm filter pill", () => {
    const onFilterChange = vi.fn();
    const view = render(
      <OrderHistoryTab
        orders={[ORDER]}
        isLoading={false}
        page={1}
        totalPages={1}
        filter="active"
        onFilterChange={onFilterChange}
        onPageChange={vi.fn()}
        onCancel={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Đơn huỷ" }));
    expect(onFilterChange).toHaveBeenCalledWith("cancelled");
  });
});
