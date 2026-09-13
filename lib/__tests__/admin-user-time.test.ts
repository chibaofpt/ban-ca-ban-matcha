import { describe, expect, it } from "vitest";

import {
  adminVoucherDaysRemaining,
  effectiveAdminVoucherStatus,
  vietnamYearBounds,
} from "@/lib/adminUserTime";

describe("thời gian quản lý khách hàng Admin", () => {
  it("tính ranh giới năm Việt Nam qua thời điểm giao năm UTC", () => {
    const before = vietnamYearBounds(new Date("2025-12-31T16:59:59.000Z"));
    const after = vietnamYearBounds(new Date("2025-12-31T17:00:00.000Z"));
    expect(before).toEqual({
      year: 2025,
      start: new Date("2024-12-31T17:00:00.000Z"),
      end: new Date("2025-12-31T17:00:00.000Z"),
    });
    expect(after.year).toBe(2026);
  });

  it("chiếu ACTIVE hết hạn thành EXPIRED nhưng giữ RESERVED", () => {
    const now = new Date("2026-04-10T12:00:00.000Z");
    const expired = new Date("2026-04-10T11:59:59.000Z");
    expect(effectiveAdminVoucherStatus("ACTIVE", expired, now)).toBe("EXPIRED");
    expect(effectiveAdminVoucherStatus("RESERVED", expired, now)).toBe("RESERVED");
  });

  it("làm tròn số ngày còn lại lên và không trả số âm", () => {
    const now = new Date("2026-04-10T12:00:00.000Z");
    expect(adminVoucherDaysRemaining(new Date("2026-04-11T12:00:01.000Z"), now)).toBe(2);
    expect(adminVoucherDaysRemaining(new Date("2026-04-10T11:59:59.000Z"), now)).toBe(0);
    expect(adminVoucherDaysRemaining(null, now)).toBeNull();
  });
});
