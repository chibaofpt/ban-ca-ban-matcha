import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockMenuItemFindUnique = vi.fn();
const mockVoucherCount = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findUnique: (...args: unknown[]) => mockMenuItemFindUnique(...args) },
    voucher: { count: (...args: unknown[]) => mockVoucherCount(...args) },
  },
}));

import { PUT } from "@/app/api/admin/menu/[id]/route";

const menuItemId = "11111111-1111-4111-8111-111111111111";

function priceUpdateRequest(): Request {
  return new Request(`http://localhost/api/admin/menu/${menuItemId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ unit_price_vnd: 20_000 }),
  });
}

describe("PUT /api/admin/menu/[id] — cảnh báo voucher ITEM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
    mockMenuItemFindUnique.mockResolvedValue({
      id: menuItemId,
      category: "extras",
      unit_price_vnd: 10_000,
    });
    mockVoucherCount.mockResolvedValue(1);
  });

  it("cảnh báo khi món đang sửa nằm trong scope của voucher ITEM còn hiệu lực", async () => {
    const response = await PUT(priceUpdateRequest(), {
      params: Promise.resolve({ id: menuItemId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "CONFLICT",
      details: {
        reason: "ACTIVE_ITEM_VOUCHERS",
        count: 1,
        old_unit_price_vnd: 10_000,
        new_unit_price_vnd: 20_000,
      },
    });
    expect(mockVoucherCount).toHaveBeenCalledWith({
      where: {
        voucher_type: "ITEM",
        status: { in: ["ACTIVE", "RESERVED"] },
        AND: [
          {
            OR: [
              { menu_item_id: menuItemId },
              { menuItemScopes: { some: { menu_item_id: menuItemId } } },
            ],
          },
          { OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }] },
        ],
      },
    });
  });
});
