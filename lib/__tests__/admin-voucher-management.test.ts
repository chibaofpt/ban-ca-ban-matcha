import { describe, expect, it } from "vitest";

import { buildAdminVoucherStats, effectiveVoucherStatus } from "@/lib/adminVoucherInsights";

describe("Thống kê quản trị voucher", () => {
  it("tính trạng thái hết hạn hiệu lực mà không ghi dữ liệu", () => {
    const now = new Date("2026-08-26T08:00:00.000Z");
    expect(effectiveVoucherStatus({ status: "ACTIVE", expires_at: new Date("2026-08-26T07:59:59.000Z") }, now)).toBe("EXPIRED");
    expect(effectiveVoucherStatus({ status: "RESERVED", expires_at: new Date("2026-08-20T00:00:00.000Z") }, now)).toBe("RESERVED");
  });

  it("đếm mọi voucher đã cấp và tính số lượng còn lại", () => {
    const stats = buildAdminVoucherStats(
      { id: "pkg", quantity: 10, issued_count: 5 },
      [{ package_id: "pkg", status: "ACTIVE", _count: { _all: 2 } }, { package_id: "pkg", status: "RESERVED", _count: { _all: 1 } }, { package_id: "pkg", status: "REDEEMED", _count: { _all: 1 } }, { package_id: "pkg", status: "REFUNDED", _count: { _all: 1 } }],
      [{ package_id: "pkg", _count: { _all: 1 } }],
    );
    expect(stats).toEqual({ issued_count: 5, active_count: 1, reserved_count: 1, redeemed_count: 1, expired_count: 1, refunded_count: 1, remaining_quantity: 5 });
  });
});
