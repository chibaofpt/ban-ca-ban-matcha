import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readVoucherExchangeRanking,
  voucherExchangePeriodBounds,
  type AdminVoucherExchangeRankingDatabase,
} from "@/lib/vouchers/adminVoucherRanking";

const mockGroupBy = vi.fn();
const mockPackageFindMany = vi.fn();

function fakeDb(): AdminVoucherExchangeRankingDatabase {
  return {
    voucher: { groupBy: (args) => mockGroupBy(args) },
    voucherPackage: { findMany: (args) => mockPackageFindMany(args) },
  };
}

const SATURDAY = new Date("2026-10-17T05:30:00.000Z"); // 12:30 Thứ Bảy 17/10/2026 giờ Việt Nam

describe("voucherExchangePeriodBounds", () => {
  it("tính mốc năm theo lịch Việt Nam", () => {
    expect(voucherExchangePeriodBounds("year", SATURDAY)).toEqual({
      from: new Date("2025-12-31T17:00:00.000Z"),
      to: new Date("2026-12-31T17:00:00.000Z"),
    });
  });

  it("tính mốc tháng theo lịch Việt Nam", () => {
    expect(voucherExchangePeriodBounds("month", SATURDAY)).toEqual({
      from: new Date("2026-09-30T17:00:00.000Z"),
      to: new Date("2026-10-31T17:00:00.000Z"),
    });
  });

  it("tính mốc tuần bắt đầu Thứ Hai theo giờ Việt Nam", () => {
    expect(voucherExchangePeriodBounds("week", SATURDAY)).toEqual({
      from: new Date("2026-10-11T17:00:00.000Z"),
      to: new Date("2026-10-18T17:00:00.000Z"),
    });
  });

  it("tính mốc ngày theo giờ Việt Nam", () => {
    expect(voucherExchangePeriodBounds("day", SATURDAY)).toEqual({
      from: new Date("2026-10-16T17:00:00.000Z"),
      to: new Date("2026-10-17T17:00:00.000Z"),
    });
  });

  it("đổi mốc ngày và tuần đúng tại nửa đêm Việt Nam", () => {
    const beforeMidnight = new Date("2026-10-17T16:59:59.999Z"); // 23:59:59 Thứ Bảy
    const midnight = new Date("2026-10-17T17:00:00.000Z"); // 00:00 Chủ Nhật
    expect(voucherExchangePeriodBounds("day", beforeMidnight)).toEqual({
      from: new Date("2026-10-16T17:00:00.000Z"),
      to: new Date("2026-10-17T17:00:00.000Z"),
    });
    expect(voucherExchangePeriodBounds("day", midnight)).toEqual({
      from: new Date("2026-10-17T17:00:00.000Z"),
      to: new Date("2026-10-18T17:00:00.000Z"),
    });
    expect(voucherExchangePeriodBounds("week", midnight)).toEqual({
      from: new Date("2026-10-11T17:00:00.000Z"),
      to: new Date("2026-10-18T17:00:00.000Z"),
    });
  });

  it("tuần vắt qua năm và ranh giới năm dùng lịch Việt Nam", () => {
    const newYearMorning = new Date("2026-01-01T00:00:00.000Z"); // 07:00 Thứ Năm 01/01/2026
    expect(voucherExchangePeriodBounds("week", newYearMorning)).toEqual({
      from: new Date("2025-12-28T17:00:00.000Z"),
      to: new Date("2026-01-04T17:00:00.000Z"),
    });
    expect(voucherExchangePeriodBounds("year", new Date("2025-12-31T16:59:59.999Z"))).toEqual({
      from: new Date("2024-12-31T17:00:00.000Z"),
      to: new Date("2025-12-31T17:00:00.000Z"),
    });
  });
});

describe("readVoucherExchangeRanking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("chỉ đếm voucher đổi điểm trong mốc và xếp hạng giảm dần", async () => {
    mockGroupBy.mockResolvedValue([
      { package_id: "pkg-small", _count: { _all: 2 } },
      { package_id: "pkg-top", _count: { _all: 7 } },
    ]);
    mockPackageFindMany.mockResolvedValue([
      { id: "pkg-small", name: "Freeship", description: null, created_at: new Date("2026-09-01T00:00:00.000Z") },
      { id: "pkg-top", name: "Free upsize", description: "Nâng size", created_at: new Date("2026-08-01T00:00:00.000Z") },
    ]);

    await expect(readVoucherExchangeRanking(fakeDb(), "year", SATURDAY)).resolves.toEqual({
      period: "year",
      from: "2025-12-31T17:00:00.000Z",
      to: "2026-12-31T17:00:00.000Z",
      items: [
        { id: "pkg-top", name: "Free upsize", description: "Nâng size", exchange_count: 7 },
        { id: "pkg-small", name: "Freeship", description: null, exchange_count: 2 },
      ],
    });
    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["package_id"],
      where: {
        issued_via: "POINTS_EXCHANGE",
        created_at: { gte: new Date("2025-12-31T17:00:00.000Z"), lt: new Date("2026-12-31T17:00:00.000Z") },
      },
      _count: { _all: true },
    });
  });

  it("bỏ lượt của gói không còn tồn tại và phá đồng hạng theo gói tạo mới hơn", async () => {
    mockGroupBy.mockResolvedValue([
      { package_id: "pkg-gone", _count: { _all: 9 } },
      { package_id: "pkg-old", _count: { _all: 3 } },
      { package_id: "pkg-new", _count: { _all: 3 } },
    ]);
    mockPackageFindMany.mockResolvedValue([
      { id: "pkg-old", name: "Cũ", description: null, created_at: new Date("2026-01-01T00:00:00.000Z") },
      { id: "pkg-new", name: "Mới", description: null, created_at: new Date("2026-10-01T00:00:00.000Z") },
    ]);

    const result = await readVoucherExchangeRanking(fakeDb(), "month", SATURDAY);
    expect(result.items.map((item) => item.id)).toEqual(["pkg-new", "pkg-old"]);
  });

  it("không truy vấn gói khi chưa có lượt đổi nào", async () => {
    mockGroupBy.mockResolvedValue([]);
    const result = await readVoucherExchangeRanking(fakeDb(), "day", SATURDAY);
    expect(result.items).toEqual([]);
    expect(mockPackageFindMany).not.toHaveBeenCalled();
  });
});
