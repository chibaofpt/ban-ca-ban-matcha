import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockOrderCount = vi.fn();
const mockOrderFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/publicIdentifiers", () => ({
  resolveStaffIdentifier: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      count: (...args: unknown[]) => mockOrderCount(...args),
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { GET } from "@/app/api/admin/orders/route";

describe("GET /api/admin/orders — tab All", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "admin-id", role: "ADMIN", name: "Admin" });
    mockOrderCount.mockResolvedValue(0);
    mockOrderFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    );
  });

  it("loại đơn đã huỷ, giữ thứ tự mới nhất và trả role người nhận", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/admin/orders?exclude_cancelled=true"),
    );

    expect(response.status).toBe(200);
    expect(mockOrderCount).toHaveBeenCalledWith({
      where: { status: { notIn: ["CANCELLED"] } },
    });
    expect(mockOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { notIn: ["CANCELLED"] } },
      orderBy: { created_at: "desc" },
      include: expect.objectContaining({
        handler: { select: { name: true, role: true } },
      }),
    }));
  });

  it("trả tên voucher ITEM của món extras trong DTO đơn admin", async () => {
    mockOrderCount.mockResolvedValue(1);
    mockOrderFindMany.mockImplementation(async (query: {
      include: { items: { include: { itemVoucher?: unknown } } };
    }) => [{
      id: "counter-item-order", status: "COMPLETED", order_type: "COUNTER",
      payment_method: "CASH", order_code: "ITEM-001", user: null, handler: null,
      subtotal_vnd: 15000, total_voucher_discount_vnd: 0, total_vnd: 0,
      shipping_fee_vnd: 0, freeship_discount_vnd: 0, grand_total_vnd: 0,
      discountVouchers: [],
      items: [{
        menu_item_id: "extra-1", menuItem: { name: "Bánh matcha", category: "extras" },
        quantity: 1, unit_price_vnd: 15000, addons_price_vnd: 0,
        size: null, sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false,
        note: null, base_liquid_ml: null, selectedPowder: null, milkType: null,
        addons: [], productVoucher: null, addonVouchers: [],
        ...(query.include.items.include.itemVoucher ? {
          itemVoucher: { id: "private-voucher-id", package: { name: "Tặng bánh matcha" } },
        } : {}),
      }],
    }]);

    const response = await GET(new NextRequest("http://localhost/api/admin/orders"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].items[0].itemVoucher).toEqual({ package: { name: "Tặng bánh matcha" } });
    expect(JSON.stringify(body)).not.toContain("private-voucher-id");
  });
});
