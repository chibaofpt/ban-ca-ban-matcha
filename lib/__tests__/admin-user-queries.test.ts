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

import { getAdminUser, listAdminUsers, listAdminUserVoucherPackages } from "@/lib/users/adminUserQueries";

const now = new Date("2026-09-19T05:00:00.000Z");
const completedAt = new Date("2026-09-18T04:00:00.000Z");
const latestAnyAt = new Date("2026-09-19T03:00:00.000Z");

function customer(id: string, qrToken: string, passwordHash = "bcrypt-hash") {
  return {
    id,
    role: "CUSTOMER", account_origin: "LEGACY_PHONE", google_sub: null, email: null, sourceMerge: null,
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
    mocks.voucherGroupBy.mockReset().mockResolvedValue([])
      .mockResolvedValueOnce([{ user_id: "completed-11", _count: { _all: 4 } }])
      .mockResolvedValueOnce([{ user_id: "completed-11", _count: { _all: 2 } }]);
  });

  it("lọc ghost theo credential và kết hợp tìm kiếm trước khi đếm/phân trang", async () => {
    mocks.userCount.mockReset().mockResolvedValue(0);
    mocks.userFindMany.mockReset().mockResolvedValue([]);
    const result = await listAdminUsers(2, "@ca.ngon", now, "GHOST");
    const expectedFilter = {
      role: "CUSTOMER", sourceMerge: { is: null },
      AND: [
        { OR: [{ password_hash: null }, { password_hash: "" }, { password_hash: "GHOST_USER_NO_PASSWORD" }] },
        { OR: [{ google_sub: null }, { google_sub: "" }] },
      ],
      OR: expect.arrayContaining([{ insta_name: { contains: "ca.ngon", mode: "insensitive" } }]),
    };
    expect(mocks.userCount).toHaveBeenCalledWith({ where: expectedFilter });
    expect(mocks.userCount).toHaveBeenCalledWith({ where: { AND: [expectedFilter, { orders: { some: { status: "COMPLETED" } } }] } });
    expect(mocks.userFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [expectedFilter, { orders: { none: { status: "COMPLETED" } } }] },
      skip: 10, take: 10,
    }));
    expect(result).toEqual({ items: [], total: 0, page: 2, total_pages: 0 });
  });

  it.each([
    { filter: "ORDER_TODAY" as const, instant: "2026-01-31T16:59:59.999Z", start: "2026-01-30T17:00:00.000Z", end: "2026-01-31T17:00:00.000Z" },
    { filter: "ORDER_TODAY" as const, instant: "2026-01-31T17:00:00.000Z", start: "2026-01-31T17:00:00.000Z", end: "2026-02-01T17:00:00.000Z" },
    { filter: "ORDER_MONTH" as const, instant: "2026-01-31T17:00:00.000Z", start: "2026-01-31T17:00:00.000Z", end: "2026-02-28T17:00:00.000Z" },
    { filter: "ORDER_MONTH" as const, instant: "2026-12-31T17:00:00.000Z", start: "2026-12-31T17:00:00.000Z", end: "2027-01-31T17:00:00.000Z" },
  ])("lọc $filter tại $instant theo ngày/tháng Việt Nam và không giới hạn trạng thái đơn", async ({ filter, instant, start, end }) => {
    mocks.userCount.mockReset().mockResolvedValue(0);
    mocks.userFindMany.mockReset().mockResolvedValue([]);
    await listAdminUsers(1, "Mèo", new Date(instant), filter);
    expect(mocks.userCount).toHaveBeenCalledWith({ where: {
      role: "CUSTOMER", sourceMerge: { is: null },
      orders: { some: { created_at: { gte: new Date(start), lt: new Date(end) } } },
      OR: expect.arrayContaining([{ name: { contains: "Mèo", mode: "insensitive" } }]),
    } });
  });

  it("lọc email null hoặc rỗng bằng AND với tìm kiếm và giữ bộ lọc trong nhóm completed", async () => {
    mocks.userCount.mockReset().mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mocks.userFindMany.mockReset().mockResolvedValueOnce([])
      .mockResolvedValueOnce([customer("no-email", "customer-no-email")]);
    mocks.orderGroupBy.mockReset().mockImplementation(async (args: { _max?: { updated_at?: boolean } }) =>
      args._max?.updated_at ? [{ user_id: "no-email", _max: { updated_at: completedAt } }] : []);
    const result = await listAdminUsers(1, "Khách", now, "NO_EMAIL");
    const expectedFilter = {
      role: "CUSTOMER", sourceMerge: { is: null },
      AND: [{ OR: [{ email: null }, { email: "" }] }],
      OR: expect.arrayContaining([{ name: { contains: "Khách", mode: "insensitive" } }]),
    };
    expect(mocks.userCount).toHaveBeenCalledWith({ where: expectedFilter });
    expect(mocks.orderGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: { not: null }, status: "COMPLETED", user: { is: expectedFilter } },
    }));
    expect(result).toMatchObject({ total: 1, total_pages: 1, items: [{ qr_token: "customer-no-email" }] });
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

describe("Tìm khách bằng điện thoại chuẩn hóa — APPLICATION_LOGIC", () => {
  it.each(["0912345678", "0912", "+84912", "84912345678", "091 234 5678", "5678", "Khách", "@ca.ngon"])("tìm ra cùng khách bằng %s", async (q) => {
    const row = { ...customer("phone-1", "public-customer"), phone_number: "+84912345678", insta_name: "ca.ngon" };
    type Search = { OR?: Array<{ phone_number?: { contains: string }; name?: { contains: string }; insta_name?: { contains: string } }> };
    const matches = (where: Search) => where.OR?.some((clause) =>
      clause.phone_number ? row.phone_number.includes(clause.phone_number.contains)
        : clause.name ? row.name.includes(clause.name.contains)
          : clause.insta_name ? row.insta_name.includes(clause.insta_name.contains) : false);
    mocks.userCount.mockReset().mockImplementation(async ({ where }: { where: Search & { AND?: unknown[] } }) => where.AND ? 0 : matches(where) ? 1 : 0);
    mocks.userFindMany.mockReset().mockImplementation(async ({ where }: { where: { AND?: Search[]; id?: unknown } }) =>
      where.id ? [row] : matches(where.AND![0]) ? [{ id: row.id }] : []);
    mocks.orderGroupBy.mockReset().mockResolvedValue([]);
    mocks.pointsLogGroupBy.mockReset().mockResolvedValue([]);
    mocks.voucherGroupBy.mockReset().mockResolvedValue([]);
    const result = await listAdminUsers(1, q, now);
    expect(result.items.map((item) => item.qr_token)).toEqual(["public-customer"]);
    expect(result.total).toBe(1);
  });
});

describe("quyền nhận link claim — APPLICATION_LOGIC", () => {
  it("ghost legacy có 7 điểm không có lịch sử/voucher vẫn được hiển thị quyền gửi link", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "ghost" });
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.orderGroupBy.mockReset().mockResolvedValue([]);
    mocks.userFindMany.mockReset().mockResolvedValue([{ ...customer("ghost", "ghost-qr", "GHOST_USER_NO_PASSWORD"), points_balance: 7 }]);
    mocks.pointsLogGroupBy.mockReset().mockResolvedValue([]);
    mocks.voucherGroupBy.mockReset().mockResolvedValue([]);
    const result = await getAdminUser("ghost-qr", now);
    expect(result).toMatchObject({ points_balance: 7, is_registered: false, has_password: false, can_send_claim_link: true });
  });

  it("ghost legacy hết điểm nhưng có lịch sử điểm dương vẫn được nhận link", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "ghost" });
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.orderGroupBy.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([{ ...customer("ghost", "ghost-qr", "GHOST_USER_NO_PASSWORD"), email: null, google_sub: null, account_origin: "LEGACY_PHONE", sourceMerge: null, points_balance: 0 }]);
    mocks.pointsLogGroupBy.mockImplementation(async ({ where }: { where: { delta: { gt?: number; lt?: number } } }) =>
      where.delta.gt === 0 ? [{ user_id: "ghost", _count: { _all: 1 } }] : []);
    mocks.voucherGroupBy.mockReset().mockResolvedValue([]);
    const result = await getAdminUser("ghost-qr", now);
    expect(result).toMatchObject({ points_balance: 0, is_registered: false, has_password: false, can_send_claim_link: true });
  });

  it("ghost legacy hết điểm vẫn nhận link nếu có voucher bất kỳ kể cả đã dùng", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "ghost" });
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.orderGroupBy.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([{ ...customer("ghost", "ghost-qr", "GHOST_USER_NO_PASSWORD"), points_balance: 0 }]);
    mocks.pointsLogGroupBy.mockReset().mockResolvedValue([]);
    mocks.voucherGroupBy.mockReset().mockImplementation(async ({ where }: { where: { issued_via?: string; OR?: unknown[] } }) =>
      !where.issued_via && !where.OR ? [{ user_id: "ghost", _count: { _all: 1 } }] : []);
    expect(await getAdminUser("ghost-qr", now)).toMatchObject({
      can_send_claim_link: true, points_balance: 0, current_voucher_count: 0, vouchers_exchanged: 0,
    });
  });

  it("Google-only được xem là đăng ký và không có mật khẩu hay link claim", async () => {
    mocks.userFindFirst.mockResolvedValue({ id: "google" });
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.orderGroupBy.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([{ ...customer("google", "google-qr"), password_hash: null, phone_number: null, email: "ca@example.com", google_sub: "google-sub", account_origin: "GOOGLE_EMAIL", sourceMerge: null }]);
    mocks.pointsLogGroupBy.mockResolvedValue([]);
    mocks.voucherGroupBy.mockReset().mockResolvedValue([]);
    const result = await getAdminUser("google-qr", now);
    expect(result).toMatchObject({ is_registered: true, has_password: false, can_send_claim_link: false, email: "ca@example.com" });
  });
});
