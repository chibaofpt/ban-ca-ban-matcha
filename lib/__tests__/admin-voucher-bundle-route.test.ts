import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  packageCreate: vi.fn(),
  packageFindUnique: vi.fn(),
  packageUpdate: vi.fn(),
  menuFindMany: vi.fn(),
  addonFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateVoucherCaches: vi.fn() }));
vi.mock("@/lib/pricing", () => ({
  buildPricingContext: vi.fn(),
  resolveOrderItemPrice: vi.fn(),
  resolveOrderItemPremiumLatte: vi.fn(),
  resolveOrderItemBaseLiquidMl: vi.fn().mockReturnValue(200),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    voucherPackage: {
      findMany: vi.fn(),
      findUnique: mocks.packageFindUnique,
      create: mocks.packageCreate,
      update: mocks.packageUpdate,
    },
    menuItem: { findMany: mocks.menuFindMany, findUnique: vi.fn() },
    addonOption: { findMany: mocks.addonFindMany, findUnique: vi.fn() },
  },
}));

import { POST } from "@/app/api/admin/voucher-packages/route";
import { PUT } from "@/app/api/admin/voucher-packages/[id]/route";

const MENU_ID = "22222222-2222-4222-8222-222222222222";

function payload() {
  return {
    voucher_type: "BUNDLE",
    name: "Mua 1 tặng 1",
    acquisition_mode: "AUTO_GRANT",
    points_cost: 0,
    ends_at: "2026-08-20T16:59:59.999Z",
    min_order_vnd: 80_000,
    quantity: null,
    max_per_user: 1,
    bundle_rule: {
      buy_quantity: 1,
      reward_quantity: 1,
      reward_kind: "PRODUCT",
      reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE",
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
      qualifier_scopes: [{ menu_item_id: MENU_ID }],
      reward_product_scopes: [],
      reward_addon_option_ids: [],
    },
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/voucher-packages", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/voucher-packages — BUNDLE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.menuFindMany.mockResolvedValue([{ id: MENU_ID, category: "latte", is_available: true }]);
    mocks.addonFindMany.mockResolvedValue([]);
    mocks.packageCreate.mockResolvedValue({ id: "package-id", voucher_type: "BUNDLE" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({
        voucherPackage: { create: mocks.packageCreate },
        menuItem: { findMany: mocks.menuFindMany },
        addonOption: { findMany: mocks.addonFindMany },
      }),
    );
  });

  it("tạo package và rule BUNDLE trực tiếp trong cùng transaction", async () => {
    const response = await POST(request(payload()) as never);

    expect(response.status).toBe(201);
    expect(mocks.packageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        voucher_type: "BUNDLE",
        acquisition_mode: "AUTO_GRANT",
        ends_at: new Date("2026-08-20T16:59:59.999Z"),
        min_order_vnd: 80_000,
        bundleRule: { create: expect.objectContaining({ buy_quantity: 1 }) },
      }),
      include: expect.objectContaining({ bundleRule: expect.any(Object) }),
    });
  });

  it("trả 422 khi scope tham chiếu món ngừng bán", async () => {
    mocks.menuFindMany.mockResolvedValue([]);
    const response = await POST(request(payload()) as never);

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("BUSINESS_RULE_VIOLATION");
    expect(mocks.packageCreate).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/voucher-packages/[id] — bất biến sau phát hành", () => {
  it("từ chối sửa điểm, hạn dùng hoặc rule", async () => {
    mocks.getSession.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.packageFindUnique.mockResolvedValue({ id: "package-id", voucher_type: "BUNDLE" });
    const response = await PUT(
      request({ points_cost: 99, ends_at: null }) as never,
      { params: Promise.resolve({ id: "package-id" }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
    expect(mocks.packageUpdate).not.toHaveBeenCalled();
  });
});
