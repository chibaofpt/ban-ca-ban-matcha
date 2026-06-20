/**
 * Tests for GET /api/admin/report — Admin-only full report endpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared before imports ─────────────────────────────────────────

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

const mockOrderFindMany = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();
const mockPowderSizeConfigFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
    },
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

// ── Import AFTER mocks ─────────────────────────────────────────────────────

import { GET } from "@/app/api/admin/report/route";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/admin/report");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

const adminSession = { id: "admin-id", role: "ADMIN", name: "Admin" };
const staffSession = { id: "staff-id", role: "STAFF", name: "Staff" };

// Common mock data
const defaultParams = { startDate: "2026-06-01", endDate: "2026-06-20" };

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/report — quyền truy cập", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultSizeConfigFindMany.mockResolvedValue([
      { size: "M", milk_ml: 200, powder_gram: { toNumber: () => 4 } },
    ]);
    mockPowderSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: "p1", name: "Meyumi" }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "m1", name: "Sữa bò" }]);
    mockOrderFindMany.mockResolvedValue([]);
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET(makeReq(defaultParams));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("Staff gọi → 403 FORBIDDEN", async () => {
    mockGetSession.mockResolvedValue(staffSession);

    const res = await GET(makeReq(defaultParams));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("trả 400 khi thiếu startDate", async () => {
    mockGetSession.mockResolvedValue(adminSession);

    const res = await GET(makeReq({ endDate: "2026-06-20" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("trả 400 khi thiếu endDate", async () => {
    mockGetSession.mockResolvedValue(adminSession);

    const res = await GET(makeReq({ startDate: "2026-06-01" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/admin/report — Admin nhận full report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockDefaultSizeConfigFindMany.mockResolvedValue([
      { size: "M", milk_ml: 200, powder_gram: { toNumber: () => 4 } },
    ]);
    mockPowderSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: "p1", name: "Meyumi" }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "m1", name: "Sữa bò" }]);
  });

  it("Admin nhận full report — trả 200 với structure đúng (addon_usage, revenue_by_type, top_products)", async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        total_vnd: 69_000,
        order_type: "COUNTER",
        items: [
          {
            menu_item_id: "item-1",
            quantity: 1,
            size: "M",
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
                quantity: 1,
                unit_price_vnd: 0,
                addonOption: { label: "Nửa viên kem", group: { name: "Kem" }, gram_value: null },
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
    expect(body.data.revenue_by_type).toBeInstanceOf(Array);
    expect(body.data.top_products).toBeInstanceOf(Array);
  });

  it("Admin lọc theo staffId — truyền handled_by filter xuống prisma query", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    // staffId phải là UUID hợp lệ (Zod validation)
    await GET(makeReq({ ...defaultParams, staffId: "550e8400-e29b-41d4-a716-446655440000" }));

    const findManyCall = mockOrderFindMany.mock.calls[0]?.[0];
    expect(findManyCall?.where?.handled_by).toBe("550e8400-e29b-41d4-a716-446655440000");
  });


  it("Admin không truyền staffId → không có handled_by filter", async () => {
    mockOrderFindMany.mockResolvedValue([]);

    await GET(makeReq(defaultParams));

    const findManyCall = mockOrderFindMany.mock.calls[0]?.[0];
    expect(findManyCall?.where?.handled_by).toBeUndefined();
  });

  it("trả về revenue_by_type với đúng COUNTER total", async () => {
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

  it("trả về top_products sorted descending theo số ly", async () => {
    mockOrderFindMany.mockResolvedValue([
      {
        total_vnd: 100_000,
        order_type: "COUNTER",
        items: [
          {
            menu_item_id: "item-a",
            quantity: 3,
            size: "M",
            selected_powder_id: null,
            selected_milk_type_id: "m1",
            menuItem: { name: "Sản phẩm A", category: "latte", matcha_powder_id: "p1", custom_powder_grams: null },
            addons: [],
          },
          {
            menu_item_id: "item-b",
            quantity: 10,
            size: "L",
            selected_powder_id: "p1",
            selected_milk_type_id: null,
            menuItem: { name: "Sản phẩm B", category: "fusion", matcha_powder_id: null, custom_powder_grams: null },
            addons: [],
          },
        ],
      },
    ]);

    const res = await GET(makeReq(defaultParams));
    const body = await res.json();

    expect(body.data.top_products[0].name).toBe("Sản phẩm B");
    expect(body.data.top_products[0].total_cups).toBe(10);
    expect(body.data.top_products[1].name).toBe("Sản phẩm A");
    expect(body.data.top_products[1].total_cups).toBe(3);
  });
});
