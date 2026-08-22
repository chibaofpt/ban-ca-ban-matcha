import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockFindManyPackages = vi.fn();
const mockGroupByVouchers = vi.fn();
const mockMenuItemFindMany = vi.fn();
const mockPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockAddonOptionFindMany = vi.fn();

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
    menuItem: { findMany: (...args: unknown[]) => mockMenuItemFindMany(...args) },
    matchaPowder: { findMany: (...args: unknown[]) => mockPowderFindMany(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    addonOption: { findMany: (...args: unknown[]) => mockAddonOptionFindMany(...args) },
  },
}));

import { GET } from "@/app/api/voucher-packages/route";

describe("GET /api/voucher-packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindManyPackages.mockReset();
    mockGroupByVouchers.mockResolvedValue([]);
    mockMenuItemFindMany.mockResolvedValue([]);
    mockPowderFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
    mockAddonOptionFindMany.mockResolvedValue([]);
  });

  it("trả remaining_quantity theo tổng voucher đã phát hành", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages
      .mockResolvedValueOnce([{ id: "pkg-1", quantity: 10, created_at: new Date().toISOString() }])
      .mockResolvedValueOnce([]);
    mockGroupByVouchers.mockResolvedValueOnce([{ package_id: "pkg-1", _count: { id: 7 } }]);

    const json = await (await GET()).json();

    expect(json.data[0].remaining_quantity).toBe(3);
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
      .mockResolvedValueOnce([{
        id: "bundle-1", voucher_type: "BUNDLE", menu_item_id: null, size: null,
        matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
        bundleRule: {
          buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
          benefit_scaling: "PER_BUNDLE", max_applications_order: 1, max_reward_units_order: null,
          productScopes: [{ role: "QUALIFIER", menu_item_id: "extra-active", default_powder_id: null,
            default_base_liquid_id: null, sizes: [], menuItem: { name: "Bánh", category: "extras", is_available: true } }],
          addonRewards: [],
        },
      }]);
    mockMenuItemFindMany.mockResolvedValue([{
      id: "extra-active", name: "Bánh", category: "extras", is_available: true,
      unit_price_vnd: 20_000, matcha_powder_id: null, default_powder_id: null,
      default_base_liquid_id: null, sizes: [], allowedBaseLiquids: [],
    }]);

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data[0].id).toBe("bundle-1");
    expect(mockFindManyPackages).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { ends_at: expect.objectContaining({ gt: expect.any(Date) }) },
            { voucher_type: { in: ["ITEM", "PRODUCT", "ADDON", "BUNDLE"] }, ends_at: null },
          ]),
        }),
      }),
    );
    expect(mockFindManyPackages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { is_active: true, ends_at: null, voucher_type: { in: ["DISCOUNT", "FREESHIP"] } },
      }),
    );
  });

  it("ẩn package BUNDLE khi không còn qualifier active", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: "bundle-unusable", voucher_type: "BUNDLE", quantity: null, created_at: new Date().toISOString(),
      bundleRule: {
        buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE", max_applications_order: 1, max_reward_units_order: null,
        productScopes: [{ role: "QUALIFIER", menu_item_id: "inactive-menu", default_powder_id: null,
          default_base_liquid_id: null, sizes: [{ size: "SMALL" }],
          menuItem: { name: "Ngưng bán", category: "latte", is_available: false } }],
        addonRewards: [],
      },
    }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it("ẩn package ITEM/PRODUCT khi target không còn orderable", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: "item-unusable", voucher_type: "ITEM", menu_item_id: "extra-inactive", size: null,
      matcha_powder_id: null, milk_type_id: null, addon_option_id: null, bundleRule: null,
    }]);
    mockMenuItemFindMany.mockResolvedValue([]);
    expect((await (await GET()).json()).data).toEqual([]);
  });
});
