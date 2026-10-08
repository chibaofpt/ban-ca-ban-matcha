import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockFindManyPackages = vi.fn();
const mockGroupByVouchers = vi.fn();
const mockMenuItemFindMany = vi.fn();
const mockPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockAddonOptionFindMany = vi.fn();
const mockUserFindUnique = vi.fn();

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
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
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
    mockUserFindUnique.mockReset();
    mockFindManyPackages.mockReset();
    mockGroupByVouchers.mockResolvedValue([]);
    mockMenuItemFindMany.mockResolvedValue([]);
    mockPowderFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
    mockAddonOptionFindMany.mockResolvedValue([]);
  });

  it("đếm lượt lifetime của khách được ADMIN chọn thay vì admin", async () => {
    mockGetSession.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mockUserFindUnique.mockResolvedValue({ id: "customer-1", qr_token: "11111111-1111-4111-8111-111111111111", role: "CUSTOMER" });
    mockFindManyPackages.mockResolvedValueOnce([{ id: "pkg-1", quantity: 5, max_per_user: 1 }]).mockResolvedValueOnce([]);
    mockGroupByVouchers.mockImplementation(async (args: { where: { user_id?: string } }) =>
      [{ package_id: "pkg-1", _count: { id: args.where.user_id === "customer-1" ? 1 : args.where.user_id ? 0 : 3 } }]);
    const request = new Request("http://localhost/api/voucher-packages?customerQrToken=11111111-1111-4111-8111-111111111111");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({ user_redeemed_count: 1, remaining_quantity: 2 });
  });

  it.each([
    [null, "11111111-1111-4111-8111-111111111111", 401, "UNAUTHORIZED"],
    [{ id: "staff-1", role: "STAFF" }, "11111111-1111-4111-8111-111111111111", 403, "FORBIDDEN"],
    [{ id: "customer-1", role: "CUSTOMER" }, "11111111-1111-4111-8111-111111111111", 403, "FORBIDDEN"],
    [{ id: "admin-1", role: "ADMIN" }, "", 400, "VALIDATION_ERROR"],
    [{ id: "admin-1", role: "ADMIN" }, "invalid", 400, "VALIDATION_ERROR"],
  ])("từ chối scope khách không hợp lệ (%s, %s)", async (session, token, status, code) => {
    mockGetSession.mockResolvedValue(session);
    const response = await GET(new Request(`http://localhost/api/voucher-packages?customerQrToken=${token}`));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it.each([null, { id: "staff-1", qr_token: "11111111-1111-4111-8111-111111111111", role: "STAFF" }])(
    "không trả catalog theo QR không tồn tại hoặc không phải CUSTOMER (%s)", async (customer) => {
      mockGetSession.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      mockUserFindUnique.mockResolvedValue(customer);
      const response = await GET(new Request("http://localhost/api/voucher-packages?customerQrToken=11111111-1111-4111-8111-111111111111"));
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    },
  );

  it("từ chối nhiều QR khách trong một request", async () => {
    mockGetSession.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    const response = await GET(new Request("http://localhost/api/voucher-packages?customerQrToken=11111111-1111-4111-8111-111111111111&customerQrToken=22222222-2222-4222-8222-222222222222"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("giữ gói PRODUCT khi còn một target và hiện lại khi cấu hình phục hồi", async () => {
    mockGetSession.mockResolvedValue(null);
    const targets = ["latte-active", "latte-inactive"].map((id) => ({
      menu_item_id: id, size: "MEDIUM", matcha_powder_id: "powder", milk_type_id: "liquid", covered_price_vnd: 48000,
      menuItem: { name: id, category: "latte", is_available: id === "latte-active", is_seasonal: false },
    }));
    const pkg = { id: "product-choice", voucher_type: "PRODUCT", acquisition_mode: "POINTS_EXCHANGE",
      quantity: null, max_per_user: 1, points_cost: 100, min_order_vnd: 999999,
      menu_item_id: null, size: null, matcha_powder_id: null, milk_type_id: null, addon_option_id: null,
      menuItemScopes: targets, bundleRule: null };
    mockPowderFindMany.mockResolvedValue([{ id: "powder", name: "Kasuga", price_per_gram: 1000, is_available: true }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "liquid", is_active: true, is_default: true, display_order: 0 }]);
    for (const isAvailable of [true, false, true]) {
      mockFindManyPackages.mockResolvedValueOnce([]).mockResolvedValueOnce([pkg]);
      mockMenuItemFindMany.mockResolvedValue(targets.map((target) => ({
        id: target.menu_item_id, name: target.menu_item_id, category: "latte",
        is_available: target.menu_item_id === "latte-active" && isAvailable,
        unit_price_vnd: null, matcha_powder_id: "powder", default_powder_id: null,
        default_base_liquid_id: "liquid", sizes: [{ size: "MEDIUM", base_price_vnd: 48000 }],
        allowedBaseLiquids: [{ base_liquid_id: "liquid" }],
      })));
      const response = await GET();
      expect(response.status).toBe(200);
      const data = (await response.json()).data;
      if (isAvailable) {
        expect(data).toHaveLength(1);
        expect(data[0]).toMatchObject({ id: "product-choice", remaining_quantity: null, min_order_vnd: 999999 });
        expect(data[0].eligible_menu_items.map((target: { menu_item_id: string }) => target.menu_item_id)).toEqual(["latte-active"]);
      } else {
        expect(data).toEqual([]);
      }
    }
  });

  it("trả stock hết là zero và giữ unlimited là null", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages.mockResolvedValueOnce([
      { id: "limited", quantity: 1 }, { id: "unlimited", quantity: null },
    ]).mockResolvedValueOnce([]);
    mockGroupByVouchers.mockResolvedValueOnce([
      { package_id: "limited", _count: { id: 4 } }, { package_id: "unlimited", _count: { id: 4 } },
    ]);
    const data = (await (await GET()).json()).data;
    expect(data.map((pkg: { remaining_quantity: number | null }) => pkg.remaining_quantity)).toEqual([0, null]);
  });

  it("trả remaining_quantity theo quota legacy và loại trừ nguồn reward hệ thống", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages
      .mockResolvedValueOnce([{ id: "pkg-1", quantity: 10, created_at: new Date().toISOString() }])
      .mockResolvedValueOnce([]);
    mockGroupByVouchers.mockResolvedValueOnce([{ package_id: "pkg-1", _count: { id: 7 } }]);

    const json = await (await GET()).json();

    expect(json.data[0].remaining_quantity).toBe(3);
    expect(mockGroupByVouchers).toHaveBeenCalledWith({
      by: ["package_id"],
      where: {
        package_id: { in: ["pkg-1"] },
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT", "ADMIN"] },
      },
      _count: { id: true },
    });
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

  it("lọc PRIVATE khỏi cả nhánh catalog cache và live", async () => {
    mockGetSession.mockResolvedValue(null);
    mockFindManyPackages.mockImplementation(async (args: { where?: { visibility?: string } }) =>
      args.where?.visibility === "PUBLIC" ? [] : [{ id: "private", visibility: "PRIVATE", is_active: true, menuItem: null, addonOption: null }]);

    const json = await (await GET()).json();

    expect(json.data).toEqual([]);
    expect(mockFindManyPackages).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ visibility: "PUBLIC" }) }));
    expect(mockFindManyPackages).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ visibility: "PUBLIC" }) }));
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
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"] },
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
            { voucher_type: { in: ["ITEM", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "BUNDLE"] }, ends_at: null },
          ]),
        }),
      }),
    );
    expect(mockFindManyPackages).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { visibility: "PUBLIC", is_active: true, ends_at: null, voucher_type: { in: ["DISCOUNT", "FREESHIP"] } },
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
