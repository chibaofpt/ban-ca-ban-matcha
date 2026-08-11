import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  packageCreate: vi.fn(),
  menuFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    promotion: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { POST } from "@/app/api/admin/promotions/route";

const menuId = "22222222-2222-4222-8222-222222222222";

function payload() {
  return {
    title: "Mua 1 tặng 1",
    starts_at: "2026-08-11T00:00:00.000Z",
    ends_at: "2026-08-20T00:00:00.000Z",
    max_redemptions: null,
    package: {
      name: "Voucher mua 1 tặng 1",
      acquisition_mode: "AUTO_GRANT",
      points_cost: 0,
      quantity: null,
      max_per_user: 1,
    },
    bundle_rule: {
      buy_quantity: 1,
      reward_quantity: 1,
      reward_kind: "PRODUCT",
      reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE",
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
      qualifier_scopes: [{ menu_item_id: menuId }],
      reward_product_scopes: [],
      reward_addon_option_ids: [],
    },
  };
}

describe("POST /api/admin/promotions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.packageCreate.mockResolvedValue({
      promotion: { id: "promotion-id", title: "Mua 1 tặng 1" },
    });
    mocks.menuFindMany.mockResolvedValue([{ id: menuId, category: "latte" }]);
    mocks.transaction.mockImplementation(
      async (callback: (tx: {
        menuItem: { findMany: typeof mocks.menuFindMany };
        matchaPowder: { findMany: ReturnType<typeof vi.fn> };
        milkType: { findMany: ReturnType<typeof vi.fn> };
        addonOption: { findMany: ReturnType<typeof vi.fn> };
        voucherPackage: { create: typeof mocks.packageCreate };
      }) => unknown) => callback({
        menuItem: { findMany: mocks.menuFindMany },
        matchaPowder: { findMany: vi.fn().mockResolvedValue([]) },
        milkType: { findMany: vi.fn().mockResolvedValue([]) },
        addonOption: { findMany: vi.fn().mockResolvedValue([]) },
        voucherPackage: { create: mocks.packageCreate },
      }),
    );
  });

  it("tạo package BUNDLE và publish rule bất biến trong cùng transaction", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/promotions", {
        method: "POST",
        body: JSON.stringify(payload()),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.packageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voucher_type: "BUNDLE",
          acquisition_mode: "AUTO_GRANT",
          promotion: {
            create: expect.objectContaining({ published_at: expect.any(Date) }),
          },
        }),
      }),
    );
  });

  it("chỉ ADMIN được tạo promotion", async () => {
    mocks.getSession.mockResolvedValue({ id: "staff", role: "STAFF" });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(payload()),
    }));
    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("từ chối campaign tham chiếu món không tồn tại hoặc đã ngưng bán", async () => {
    mocks.menuFindMany.mockResolvedValue([]);
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(payload()),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_PROMOTION_REFERENCE");
    expect(mocks.packageCreate).not.toHaveBeenCalled();
  });
});
