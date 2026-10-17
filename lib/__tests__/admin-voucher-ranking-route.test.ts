import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockGroupBy = vi.fn();
const mockPackageFindMany = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    voucher: { groupBy: (...args: unknown[]) => mockGroupBy(...args) },
    voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
  },
}));

import { GET } from "@/app/api/admin/voucher-packages/exchange-ranking/route";

const request = (query: string) =>
  new NextRequest(`http://localhost/api/admin/voucher-packages/exchange-ranking${query}`);

describe("GET /api/admin/voucher-packages/exchange-ranking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T05:30:00.000Z"));
    mockGetSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
  });
  afterEach(() => vi.useRealTimers());

  it("trả 401 khi chưa đăng nhập và 403 khi không phải ADMIN", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    expect((await GET(request("?period=year"))).status).toBe(401);
    mockGetSession.mockResolvedValueOnce({ id: "staff", role: "STAFF" });
    expect((await GET(request("?period=year"))).status).toBe(403);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it("trả 400 khi thiếu hoặc sai mốc thời gian", async () => {
    expect((await GET(request(""))).status).toBe(400);
    const invalid = await GET(request("?period=quarter"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it("trả xếp hạng đổi điểm đã sắp xếp trong envelope data", async () => {
    mockGroupBy.mockResolvedValue([{ package_id: "pkg-1", _count: { _all: 4 } }]);
    mockPackageFindMany.mockResolvedValue([
      { id: "pkg-1", name: "Free upsize", description: "Nâng size", created_at: new Date("2026-08-01T00:00:00.000Z") },
    ]);

    const response = await GET(request("?period=year"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        period: "year",
        from: "2025-12-31T17:00:00.000Z",
        to: "2026-12-31T17:00:00.000Z",
        items: [{ id: "pkg-1", name: "Free upsize", description: "Nâng size", exchange_count: 4 }],
      },
    });
  });

  it("trả 500 ổn định khi truy vấn lỗi", async () => {
    mockGroupBy.mockRejectedValue(new Error("db down"));
    const response = await GET(request("?period=day"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
