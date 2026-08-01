import { describe, expect, it } from "vitest";
import {
  groupPointsHistory,
  type PointsHistoryLog,
} from "@/lib/pointsHistory";

function makeLog(
  overrides: Partial<PointsHistoryLog> = {},
): PointsHistoryLog {
  return {
    id: "log-1",
    delta: 15,
    reason: "order_complete",
    order_id: "order-1",
    created_at: new Date("2026-08-01T10:00:00.000Z"),
    order: { total_vnd: 150_000, order_code: "BCBM-ABC123" },
    voucher: null,
    staff: { name: "Linh", role: "STAFF" },
    ...overrides,
  };
}

describe("groupPointsHistory — nhóm lịch sử điểm theo giao dịch", () => {
  it("gom điểm đơn hàng và điểm dư voucher thành một event", () => {
    const result = groupPointsHistory(
      [
        makeLog(),
        makeLog({
          id: "log-2",
          delta: 2,
          reason: "voucher_surplus",
          created_at: new Date("2026-08-01T10:00:01.000Z"),
        }),
      ],
      1,
      10,
    );

    expect(result.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "log-2",
        kind: "order_reward",
        total_delta: 17,
        order_points: 15,
        surplus_points: 2,
        order: { order_code: "BCBM-ABC123", points_base_vnd: 150_000 },
      }),
    ]);
  });

  it("không gộp reversal vào lần cộng điểm ban đầu", () => {
    const result = groupPointsHistory(
      [
        makeLog(),
        makeLog({
          id: "log-2",
          delta: -15,
          reason: "order_complete_reversed",
          created_at: new Date("2026-08-01T11:00:00.000Z"),
        }),
      ],
      1,
      10,
    );

    expect(result.events.map((event) => event.kind)).toEqual([
      "order_reversal",
      "order_reward",
    ]);
  });

  it("giữ mỗi log không thuộc đơn hàng thành một event riêng", () => {
    const result = groupPointsHistory(
      [
        makeLog({
          id: "purchase",
          delta: -20,
          reason: "voucher_purchase",
          order_id: null,
          order: null,
          voucher: { package: { name: "Matcha lớn miễn phí" } },
          staff: null,
        }),
        makeLog({
          id: "bonus",
          delta: 10,
          reason: "registration_bonus",
          order_id: null,
          order: null,
          staff: null,
        }),
      ],
      1,
      10,
    );

    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.voucher).toEqual({
      package_name: "Matcha lớn miễn phí",
    });
  });

  it("phân trang sau grouping nên không tách hai log của cùng đơn", () => {
    const otherEvents = Array.from({ length: 10 }, (_, index) =>
      makeLog({
        id: `bonus-${index}`,
        delta: 1,
        reason: "registration_bonus",
        order_id: null,
        order: null,
        staff: null,
        created_at: new Date(`2026-08-01T09:${String(index).padStart(2, "0")}:00.000Z`),
      }),
    );
    const result = groupPointsHistory(
      [
        makeLog(),
        makeLog({ id: "surplus", delta: 2, reason: "voucher_surplus" }),
        ...otherEvents,
      ],
      1,
      10,
    );

    expect(result.meta.total).toBe(11);
    expect(result.events).toHaveLength(10);
    expect(
      result.events.filter((event) => event.kind === "order_reward"),
    ).toHaveLength(1);
  });

  it("không đưa foreign key nội bộ vào DTO", () => {
    const result = groupPointsHistory([makeLog()], 1, 10);
    const serialized = JSON.stringify(result.events[0]);

    expect(serialized).not.toContain("order_id");
    expect(serialized).not.toContain("voucher_id");
    expect(serialized).not.toContain("performed_by");
  });
});
