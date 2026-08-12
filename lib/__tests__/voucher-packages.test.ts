import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockFindManyPackages = vi.fn();
const mockGroupByVouchers = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/cache", () => ({
  CACHE_KEYS: { VOUCHER_PACKAGES: "voucher-packages" },
  CACHE_TTL: { VOUCHER_PACKAGES: 300 },
  withCache: (_key: string, _ttl: number, loader: () => Promise<unknown>) => loader(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voucherPackage: { findMany: (...args: unknown[]) => mockFindManyPackages(...args) },
    voucher: { groupBy: (...args: unknown[]) => mockGroupByVouchers(...args) },
  },
}));

import { GET } from "@/app/api/voucher-packages/route";

describe("GET /api/voucher-packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindManyPackages.mockReset();
  });

  it("trả về danh sách packages active, user_redeemed_count = 0 nếu chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages.mockResolvedValueOnce([
      { id: "pkg-1", is_active: true, menuItem: null, addonOption: null },
    ]).mockResolvedValueOnce([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data[0].id).toBe("pkg-1");
    expect(json.data[0].user_redeemed_count).toBe(0);
  });

  it("trả về danh sách packages active kèm số lượng đã đổi nếu đã đăng nhập", async () => {
    mockGetSession.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    mockFindManyPackages.mockResolvedValueOnce([
      { id: "pkg-1", is_active: true, menuItem: null, addonOption: null },
      { id: "pkg-2", is_active: true, menuItem: null, addonOption: null },
    ]).mockResolvedValueOnce([]);
    mockGroupByVouchers.mockResolvedValue([
      { package_id: "pkg-1", _count: { id: 2 } },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    const packages = json.data as Array<{ id: string; user_redeemed_count: number }>;
    const pkg1 = packages.find((pkg) => pkg.id === "pkg-1");
    const pkg2 = packages.find((pkg) => pkg.id === "pkg-2");

    if (!pkg1 || !pkg2) throw new Error("Expected voucher packages are missing");

    expect(pkg1.user_redeemed_count).toBe(2);
    expect(pkg2.user_redeemed_count).toBe(0);
    expect(mockGroupByVouchers).toHaveBeenCalledWith({
      by: ["package_id"],
      where: {
        package_id: { in: ["pkg-1", "pkg-2"] },
        user_id: "user-1",
      },
      _count: { id: true },
    });
  });

  it("đọc package BUNDLE đang diễn ra trực tiếp, không lấy từ cache promotion", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "bundle-1", voucher_type: "BUNDLE" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data[0].id).toBe("bundle-1");
    expect(mockFindManyPackages).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ends_at: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      }),
    );
  });
});
