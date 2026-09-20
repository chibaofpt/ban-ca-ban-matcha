import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  orderGroupBy: vi.fn(),
  orderFindFirst: vi.fn(),
  pointsLogGroupBy: vi.fn(),
  voucherGroupBy: vi.fn(),
  voucherPackageCount: vi.fn(),
  voucherPackageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: mocks.userCount, findMany: mocks.userFindMany, findFirst: mocks.userFindFirst },
    order: { groupBy: mocks.orderGroupBy, findFirst: mocks.orderFindFirst },
    pointsLog: { groupBy: mocks.pointsLogGroupBy },
    voucher: { groupBy: mocks.voucherGroupBy },
    voucherPackage: { count: mocks.voucherPackageCount, findMany: mocks.voucherPackageFindMany },
  },
}));

import { getAdminUser, listAdminUsers, listAdminUserVoucherPackages } from "@/lib/adminUserQueries";

const now = new Date("2026-09-19T05:00:00.000Z");
const completedAt = new Date("2026-09-18T04:00:00.000Z");
const latestAnyAt = new Date("2026-09-19T03:00:00.000Z");

function customer(id: string, qrToken: string, passwordHash = "bcrypt-hash") {
  return {
    id,
    qr_token: qrToken,
    name: `Khách ${id}`,
    phone_number: `+8490000000${id.slice(-1)}`,
    insta_name: null,
    password_hash: passwordHash,
    is_verified: false,
    is_blocked: false,
    points_balance: 20,
  };
}

describe("truy vấn quản lý khách hàng Admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pointsLogGroupBy.mockResolvedValue([{ user_id: "completed-11", _sum: { delta: -13 } }]);
    mocks.voucherGroupBy
      .mockResolvedValueOnce([{ user_id: "completed-11", _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ user_id: "completed-11", _count: { _all: 2 } }]);
  });

  it("phân trang qua ranh giới completed rồi đưa mọi khách không có completed vào đuôi ổn định", async () => {
    mocks.userCount.mockResolvedValueOnce(13).mockResolvedValueOnce(11);
    mocks.orderGroupBy.mockImplementation((args: { _max?: { updated_at?: boolean; created_at?: boolean }; _sum?: { grand_total_vnd?: boolean } }) => {
      if (args._max?.updated_at) return Promise.resolve([{ user_id: "completed-11", _max: { updated_at: completedAt } }]);
      if (args._max?.created_at) return Promise.resolve([
        { user_id: "completed-11", _max: { created_at: latestAnyAt } },
        { user_id: "pending-only", _max: { created_at: new Date("2026-09-17T00:00:00.000Z") } },
      ]);
      if (args._sum?.grand_total_vnd) return Promise.resolve([{ user_id: "completed-11", _sum: { grand_total_vnd: 120_000 } }]);
      return Promise.resolve([]);
    });
    mocks.userFindMany
      .mockResolvedValueOnce([{ id: "pending-only" }, { id: "never-ordered" }])
      .mockResolvedValueOnce([
        customer("completed-11", "00000000-0000-4000-8000-000000000011"),
        customer("pending-only", "00000000-0000-4000-8000-000000000012", "GHOST_USER_NO_PASSWORD"),
        customer("never-ordered", "00000000-0000-4000-8000-000000000013"),
      ]);

    const result = await listAdminUsers(2, undefined, now);

    expect(mocks.orderGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "COMPLETED" }),
      _max: { updated_at: true },
      orderBy: [{ _max: { updated_at: "desc" } }, { user_id: "asc" }],
      skip: 10,
      take: 1,
    }));
    expect(mocks.userFindMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([{ orders: { none: { status: "COMPLETED" } } }]) }),
      orderBy: { qr_token: "asc" },
      skip: 0,
      take: 9,
    }));
    expect(result.items.map((item) => item.qr_token)).toEqual([
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
      "00000000-0000-4000-8000-000000000013",
    ]);
    expect(result.items[0]).toMatchObject({
      latest_completed_order_at: completedAt.toISOString(),
      latest_order_at: latestAnyAt.toISOString(),
      annual_spend_vnd: 120_000,
      points_spent: 13,
      vouchers_exchanged: 4,
      current_voucher_count: 2,
      is_registered: true,
    });
    expect(result.items[1]).toMatchObject({ is_registered: false, latest_completed_order_at: null });
    expect(result).toMatchObject({ total: 13, page: 2, total_pages: 2 });
  });

  it("trả riêng mốc đơn bất kỳ và completed khi đọc một ghost profile", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "ghost" });
    mocks.orderFindFirst.mockResolvedValue({ updated_at: completedAt });
    mocks.orderGroupBy.mockImplementation((args: { _max?: { created_at?: boolean }; _sum?: { grand_total_vnd?: boolean } }) => {
      if (args._max?.created_at) return Promise.resolve([{ user_id: "ghost", _max: { created_at: latestAnyAt } }]);
      if (args._sum?.grand_total_vnd) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mocks.userFindMany.mockResolvedValue([customer("ghost", "00000000-0000-4000-8000-000000000099", "GHOST_USER_NO_PASSWORD")]);
    mocks.pointsLogGroupBy.mockResolvedValue([]);
    mocks.voucherGroupBy.mockResolvedValue([]);

    const result = await getAdminUser("00000000-0000-4000-8000-000000000099", now);

    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: "ghost", status: "COMPLETED" },
      select: { updated_at: true },
      orderBy: [{ updated_at: "desc" }, { id: "asc" }],
    }));
    expect(result).toMatchObject({
      is_registered: false,
      latest_order_at: latestAnyAt.toISOString(),
      latest_completed_order_at: completedAt.toISOString(),
    });
  });

  it("lọc đúng từng nhóm package đang hoạt động, còn hạn và phân trang mới nhất", async () => {
    mocks.voucherPackageCount.mockResolvedValue(0);
    mocks.voucherPackageFindMany.mockResolvedValue([]);
    const categories = [
      { category: "DISCOUNT" as const, page: 2, types: ["DISCOUNT", "PRODUCT_DISCOUNT"] },
      { category: "GIFT" as const, page: 1, types: ["ITEM", "PRODUCT", "ADDON", "BUNDLE"] },
      { category: "SHIPPING" as const, page: 1, types: ["FREESHIP"] },
      { category: "ALL" as const, page: 1, types: undefined },
    ];

    for (const item of categories) await listAdminUserVoucherPackages(item.page, item.category, now);

    categories.forEach((item, index) => {
      const where = {
        is_active: true,
        OR: [{ ends_at: null }, { ends_at: { gt: now } }],
        ...(item.types ? { voucher_type: { in: item.types } } : {}),
      };
      expect(mocks.voucherPackageCount).toHaveBeenNthCalledWith(index + 1, { where });
      expect(mocks.voucherPackageFindMany).toHaveBeenNthCalledWith(index + 1, {
        where,
        select: { id: true, name: true, description: true, voucher_type: true },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        skip: (item.page - 1) * 10,
        take: 10,
      });
    });
    expect(categories[1]?.types).not.toContain("PRODUCT_DISCOUNT");
  });
});
