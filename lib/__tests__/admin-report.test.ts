/**
 * Tests for GET /api/admin/report â€” Admin-only full report endpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// â”€â”€ Mocks declared before imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockGetSession = vi.fn();
const mockGetRedisClient = vi.fn();
vi.hoisted(() => { process.env.JWT_SECRET = "report-policy-test-secret-at-least-32-bytes"; });
vi.mock("@/lib/redis", () => ({ getRedisClient: () => mockGetRedisClient() }));
vi.mock("@/lib/observability", () => ({ captureServerException: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/publicIdentifiers", () => ({
  resolveStaffIdentifier: (identifier: string) => Promise.resolve({
    id: identifier,
    qr_token: "staff-public-token",
    role: "STAFF",
  }),
}));

const mockOrderFindMany = vi.fn();
const mockOrderCount = vi.fn();
const mockTransaction = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();
const mockPowderSizeConfigFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
      count: (...args: unknown[]) => mockOrderCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    defaultSizeConfig: {
      findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args),
    },
    powderSizeConfig: {
      findMany: (...args: unknown[]) => mockPowderSizeConfigFindMany(...args),
    },
    matchaPowder: {
      findMany: (...args: unknown[]) => mockMatchaPowderFindMany(...args),
    },
    milkType: {
      findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args),
    },
  },
}));

// â”€â”€ Import AFTER mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { GET } from "@/app/api/admin/report/route";
import { prisma } from "@/lib/prisma";
import { GET as getStaffReport } from "@/app/api/report/route";

beforeEach(() => {
  mockGetRedisClient.mockReturnValue(null);
  mockOrderCount.mockResolvedValue(0);
  mockTransaction.mockImplementation((callback: (db: typeof prisma) => Promise<unknown>) => callback(prisma));
});

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/admin/report");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

const adminSession = { id: "admin-id", role: "ADMIN", name: "Admin" };
const staffSession = { id: "staff-id", role: "STAFF", name: "Staff" };

// Common mock data
const defaultParams = { startDate: "2026-06-01", endDate: "2026-06-20" };

// RATE_LIMIT_POLICY: real shared limiter and routes, stateful Redis command boundary only.
describe("Report — giới hạn chung 6 request mỗi phút mỗi tài khoản", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockOrderFindMany.mockResolvedValue([]);
    mockDefaultSizeConfigFindMany.mockResolvedValue([]);
    mockPowderSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
  });

  it("đổi route không né được lần thứ 7, tài khoản khác vẫn được phép", async () => {
    const counters = new Map<string, number>();
    const expiries = new Map<string, number>();
    const clock = 1_000;
    mockGetRedisClient.mockReturnValue({
      incr: async (key: string) => {
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return count;
      },
      expire: async (key: string, seconds: number) => { expiries.set(key, clock + seconds); return 1; },
      ttl: async (key: string) => (expiries.get(key) ?? clock) - clock,
    });
    for (let attempt = 0; attempt < 6; attempt++) {
      const handler = attempt % 2 === 0 ? GET : getStaffReport;
      expect((await handler(makeReq(defaultParams))).status).toBe(200);
    }
    mockOrderFindMany.mockClear();
    const rejected = await getStaffReport(makeReq(defaultParams));
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("Retry-After")).toBe("60");
    expect(await rejected.json()).toEqual({ error: "Too many requests", code: "TOO_MANY_REQUESTS" });
    expect(mockOrderFindMany).not.toHaveBeenCalled();
    mockGetSession.mockResolvedValue({ ...adminSession, id: "another-admin" });
    expect((await GET(makeReq(defaultParams))).status).toBe(200);
    expect(counters.size).toBe(2);
    expect([...expiries.values()]).toEqual([1060, 1060]);
  });

  it("Redis lỗi vẫn cho phép đọc report theo fail-open policy", async () => {
    mockGetRedisClient.mockReturnValue({ incr: async () => { throw new Error("controlled Redis outage"); } });
    expect((await GET(makeReq(defaultParams))).status).toBe(200);
    expect((await getStaffReport(makeReq(defaultParams))).status).toBe(200);
  });
});

it("đọc đủ hai trang trong snapshot và bao gồm mili giây cuối ngày Việt Nam", async () => {
  mockGetSession.mockResolvedValue(adminSession);
  mockOrderCount.mockResolvedValue(101);
  mockDefaultSizeConfigFindMany.mockResolvedValue([]);
  mockPowderSizeConfigFindMany.mockResolvedValue([]);
  mockMatchaPowderFindMany.mockResolvedValue([]);
  mockMilkTypeFindMany.mockResolvedValue([]);
  mockOrderFindMany.mockImplementation(({ skip }: { skip: number }) => Promise.resolve(
    Array.from({ length: skip === 0 ? 100 : 1 }, () => ({ total_vnd: 1000, order_type: "COUNTER", items: [] })),
  ));
  const res = await GET(makeReq(defaultParams));
  expect(res.status).toBe(200);
  expect((await res.json()).data.summary).toMatchObject({ total_orders: 101, total_revenue_vnd: 101000 });
  expect(mockOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100, orderBy: { id: "asc" }, where: expect.objectContaining({
    created_at: { gte: new Date("2026-05-31T17:00:00Z"), lt: new Date("2026-06-20T17:00:00Z") },
  }) }));
  expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead", timeout: 10000 });
});

it("staff vẫn chỉ nhận tổng đơn và doanh thu trong snapshot", async () => {
  mockGetSession.mockResolvedValue(staffSession);
  mockOrderCount.mockResolvedValue(1);
  mockDefaultSizeConfigFindMany.mockResolvedValue([]);
  mockPowderSizeConfigFindMany.mockResolvedValue([]);
  mockMatchaPowderFindMany.mockResolvedValue([]);
  mockMilkTypeFindMany.mockResolvedValue([]);
  mockOrderFindMany.mockResolvedValue([{ total_vnd: 12000, items: [] }]);
  const res = await getStaffReport(makeReq(defaultParams));
  expect(await res.json()).toEqual({ data: { summary: { total_orders: 1, total_revenue_vnd: 12000 } } });
  expect(mockOrderCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ handled_by: "staff-id" }) }));
});

it("từ chối hơn 10000 đơn trước khi tải chi tiết, không trả tổng thiếu", async () => {
  mockGetSession.mockResolvedValue(adminSession);
  mockOrderCount.mockResolvedValue(10001);
  mockOrderFindMany.mockResolvedValue([]);
  mockDefaultSizeConfigFindMany.mockResolvedValue([]);
  mockPowderSizeConfigFindMany.mockResolvedValue([]);
  mockMatchaPowderFindMany.mockResolvedValue([]);
  mockMilkTypeFindMany.mockResolvedValue([]);
  mockOrderFindMany.mockClear();
  const res = await GET(makeReq(defaultParams));
  expect(res.status).toBe(422);
  expect(await res.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", details: { reason: "REPORT_RANGE_TOO_LARGE" } });
  expect(mockOrderFindMany).not.toHaveBeenCalled();
});

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("GET /api/admin/report â€” quyá»n truy cáº­p", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultSizeConfigFindMany.mockResolvedValue([
      { size: "SMALL", milk_ml: 200, powder_gram: { toNumber: () => 4 } },
    ]);
    mockPowderSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: "p1", name: "Meyumi" }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "m1", name: "Sá»¯a bÃ²" }]);
    mockOrderFindMany.mockResolvedValue([]);
  });

  it("tráº£ 401 khi chÆ°a Ä‘Äƒng nháº­p", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(makeReq(defaultParams));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("Staff gá»i â†’ 403 FORBIDDEN", async () => {
    mockGetSession.mockResolvedValue(staffSession);

    const res = await GET(makeReq(defaultParams));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("tráº£ 400 khi thiáº¿u startDate", async () => {
    mockGetSession.mockResolvedValue(adminSession);

    const res = await GET(makeReq({ endDate: "2026-06-20" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("tráº£ 400 khi thiáº¿u endDate", async () => {
    mockGetSession.mockResolvedValue(adminSession);

    const res = await GET(makeReq({ startDate: "2026-06-01" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("từ chối ngày Gregorian không tồn tại và range quá 366 ngày", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    const invalidDate = await GET(makeReq({ startDate: "2026-02-30", endDate: "2026-03-01" }));
    const tooLong = await GET(makeReq({ startDate: "2025-01-01", endDate: "2026-01-02" }));
    expect(invalidDate.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(mockOrderFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/report â€” Admin nháº­n full report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockDefaultSizeConfigFindMany.mockResolvedValue([
      { size: "SMALL", milk_ml: 200, powder_gram: { toNumber: () => 4 } },
    ]);
    mockPowderSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: "p1", name: "Meyumi" }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "m1", name: "Sá»¯a bÃ²" }]);
  });

  it("Admin nháº­n full report â€” tráº£ 200 vá»›i structure Ä‘Ãºng (addon_usage, revenue_by_type, top_products)", async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        total_vnd: 69_000,
        order_type: "COUNTER",
        items: [
          {
            menu_item_id: "item-1",
            quantity: 1,
            size: "SMALL",
            selected_powder_id: null,
            selected_milk_type_id: "m1",
            menuItem: {
              name: "Latte Test",
              category: "latte",
              matcha_powder_id: "p1",
              custom_powder_grams: null,
            },
            addons: [
              {
                addon_option_id: "addon-cream",
                quantity: 1,
                unit_price_vnd: 0,
                addonOption: { label: "Ná»­a viÃªn kem", group: { name: "Kem" }, gram_value: null },
              },
            ],
          },
        ],
      },
    ]);

    const res = await GET(makeReq(defaultParams));

    expect(res.status).toBe(200);
    const body = await res.json();

    // Standard report fields
    expect(body.data.summary).toMatchObject({
      total_orders: expect.any(Number),
      total_cups: expect.any(Number),
      total_revenue_vnd: expect.any(Number),
    });
    expect(body.data.powder_usage).toBeInstanceOf(Array);
    expect(body.data.milk_usage).toBeInstanceOf(Array);
    expect(body.data.latte_sales).toBeInstanceOf(Array);
    expect(body.data.fusion_sales).toBeInstanceOf(Array);

    // Admin-only extras
    expect(body.data.addon_usage).toBeInstanceOf(Array);
    expect(body.data.addon_usage[0]).toMatchObject({
      addon_option_id: "addon-cream",
      powder_breakdown: [],
    });
    expect(body.data.revenue_by_type).toBeInstanceOf(Array);
    expect(body.data.top_products).toBeInstanceOf(Array);
  });

  it("Admin lá»c theo staffId â€” truyá»n handled_by filter xuá»‘ng prisma query", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    // staffId pháº£i lÃ  UUID há»£p lá»‡ (Zod validation)
    await GET(makeReq({ ...defaultParams, staffId: "550e8400-e29b-41d4-a716-446655440000" }));

    const findManyCall = mockOrderFindMany.mock.calls[0]?.[0];
    expect(findManyCall?.where?.handled_by).toBe("550e8400-e29b-41d4-a716-446655440000");
  });


  it("Admin khÃ´ng truyá»n staffId â†’ khÃ´ng cÃ³ handled_by filter", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    await GET(makeReq(defaultParams));

    const findManyCall = mockOrderFindMany.mock.calls[0]?.[0];
    expect(findManyCall?.where?.handled_by).toBeUndefined();
  });

  it("tráº£ vá» revenue_by_type vá»›i Ä‘Ãºng COUNTER total", async () => {
    mockOrderFindMany.mockResolvedValue([
      { total_vnd: 69_000, order_type: "COUNTER", items: [] },
      { total_vnd: 55_000, order_type: "COUNTER", items: [] },
    ]);

    const res = await GET(makeReq(defaultParams));
    const body = await res.json();

    const counter = body.data.revenue_by_type.find(
      (r: { order_type: string }) => r.order_type === "COUNTER"
    );
    expect(counter?.total_revenue_vnd).toBe(124_000);
    expect(counter?.order_count).toBe(2);
  });

  it("tráº£ vá» top_products sorted descending theo sá»‘ ly", async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        total_vnd: 100_000,
        order_type: "COUNTER",
        items: [
          {
            menu_item_id: "item-a",
            quantity: 3,
            size: "SMALL",
            selected_powder_id: null,
            selected_milk_type_id: "m1",
            menuItem: { name: "Sáº£n pháº©m A", category: "latte", matcha_powder_id: "p1", custom_powder_grams: null },
            addons: [],
          },
          {
            menu_item_id: "item-b",
            quantity: 10,
            size: "MEDIUM",
            selected_powder_id: "p1",
            selected_milk_type_id: null,
            menuItem: { name: "Sáº£n pháº©m B", category: "fusion", matcha_powder_id: null, custom_powder_grams: null },
            addons: [],
          },
        ],
      },
    ]);

    const res = await GET(makeReq(defaultParams));
    const body = await res.json();

    expect(body.data.top_products[0].name).toBe("Sáº£n pháº©m B");
    expect(body.data.top_products[0].total_cups).toBe(10);
    expect(body.data.top_products[1].name).toBe("Sáº£n pháº©m A");
    expect(body.data.top_products[1].total_cups).toBe(3);
  });
});
