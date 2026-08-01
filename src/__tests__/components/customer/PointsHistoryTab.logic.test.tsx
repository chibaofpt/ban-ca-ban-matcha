import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PointsHistoryTab } from "@/src/components/customer/PointsHistoryTab";
import type { CustomerPointsData } from "@/src/lib/types/points";

afterEach(cleanup);

const DATA: CustomerPointsData = {
  points_balance: 42,
  events: [
    {
      id: "reward",
      kind: "order_reward",
      reason: "order_complete",
      total_delta: 17,
      order_points: 15,
      surplus_points: 2,
      created_at: "2026-08-01T10:00:00.000Z",
      order: { order_code: "BCBM-ABC123", points_base_vnd: 150_000 },
      voucher: null,
      actor: { name: "Linh", role: "STAFF" },
    },
    {
      id: "purchase",
      kind: "other",
      reason: "voucher_purchase",
      total_delta: -20,
      order_points: 0,
      surplus_points: 0,
      created_at: "2026-08-01T09:00:00.000Z",
      order: null,
      voucher: { package_name: "Matcha lớn miễn phí" },
      actor: null,
    },
    {
      id: "unknown",
      kind: "other",
      reason: "legacy_negative_event",
      total_delta: -3,
      order_points: 0,
      surplus_points: 0,
      created_at: "2026-08-01T08:00:00.000Z",
      order: null,
      voucher: null,
      actor: null,
    },
  ],
  meta: { total: 13, page: 1, limit: 10, totalPages: 2 },
};

describe("PointsHistoryTab — hiển thị lịch sử điểm", () => {
  it("hiển thị balance, giá trị tính điểm và breakdown", () => {
    const view = render(
      <PointsHistoryTab
        data={DATA}
        isLoading={false}
        isError={false}
        onPageChange={vi.fn()}
      />,
    );

    const text = view.container.textContent ?? "";
    expect(text).toContain("Số dư hiện tại: 42 điểm");
    expect(text).toContain("Cộng từ đơn hàng BCBM-ABC123");
    expect(text).toContain("Giá trị tính điểm: 150.000đ");
    expect(text).toContain("Điểm mua hàng");
    expect(text).toContain("+15 điểm");
    expect(text).toContain("Điểm dư từ voucher");
    expect(text).toContain("+2 điểm");
    expect(text).toContain("Thực hiện bởi Nhân viên Linh");
  });

  it("hiển thị voucher và fallback âm đúng nghĩa", () => {
    const view = render(
      <PointsHistoryTab
        data={DATA}
        isLoading={false}
        isError={false}
        onPageChange={vi.fn()}
      />,
    );

    const text = view.container.textContent ?? "";
    expect(text).toContain("Đổi voucher: Matcha lớn miễn phí");
    expect(text).toContain("Trừ điểm bởi hệ thống");
  });

  it("đổi trang bằng pagination callback", () => {
    const onPageChange = vi.fn();
    const view = render(
      <PointsHistoryTab
        data={DATA}
        isLoading={false}
        isError={false}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Trang sau" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("hiển thị empty state khi chưa có giao dịch", () => {
    const view = render(
      <PointsHistoryTab
        data={{
          ...DATA,
          events: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
        }}
        isLoading={false}
        isError={false}
        onPageChange={vi.fn()}
      />,
    );

    expect(view.container.textContent).toContain(
      "Bạn chưa có giao dịch điểm nào",
    );
  });
});
