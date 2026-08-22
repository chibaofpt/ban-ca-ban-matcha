import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  packageCreate: vi.fn(),
  packageFindUnique: vi.fn(),
  packageUpdate: vi.fn(),
  menuFindMany: vi.fn(),
  addonFindMany: vi.fn(),
  milkFindMany: vi.fn(),
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
    milkType: { findMany: mocks.milkFindMany },
  },
}));

import { POST } from "@/app/api/admin/voucher-packages/route";
import { PUT } from "@/app/api/admin/voucher-packages/[id]/route";

const MENU_ID = "22222222-2222-4222-8222-222222222222";
const POWDER_ID = "33333333-3333-4333-8333-333333333333";
const MILK_ID = "44444444-4444-4444-8444-444444444444";
const FUTURE_ENDS_AT = "2099-08-20T16:59:59.999Z";

function payload() {
  return {
    voucher_type: "BUNDLE",
    name: "Mua 1 tặng 1",
    acquisition_mode: "AUTO_GRANT",
    points_cost: 0,
    ends_at: FUTURE_ENDS_AT,
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
      qualifier_products: [{ menu_item_id: MENU_ID, allowed_sizes: ["MEDIUM"],
        default_powder_id: POWDER_ID as string | null,
        default_base_liquid_id: MILK_ID as string | null }],
      reward_products: [] as Array<{
        menu_item_id: string;
        allowed_sizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
        default_powder_id?: string | null;
        default_base_liquid_id?: string | null;
      }>,
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
    mocks.menuFindMany.mockResolvedValue([{ id: MENU_ID, category: "latte", is_available: true,
      matcha_powder_id: POWDER_ID, sizes: [{ size: "MEDIUM", base_price_vnd: 45_000 }] }]);
    mocks.addonFindMany.mockResolvedValue([]);
    mocks.milkFindMany.mockResolvedValue([{ id: MILK_ID, is_default: true }]);
    mocks.packageCreate.mockResolvedValue({ id: "package-id", voucher_type: "BUNDLE" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback({
        voucherPackage: { create: mocks.packageCreate },
        menuItem: { findMany: mocks.menuFindMany },
        addonOption: { findMany: mocks.addonFindMany },
        milkType: { findMany: mocks.milkFindMany },
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
        ends_at: new Date(FUTURE_ENDS_AT),
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

  it("cho phép FIXED_CONFIG Add-on không có cấu hình đồ uống", async () => {
    const body = payload();
    body.bundle_rule.reward_mode = "FIXED_CONFIG";
    body.bundle_rule.qualifier_products = [{ menu_item_id: MENU_ID, allowed_sizes: [],
      default_powder_id: null, default_base_liquid_id: null }];
    body.bundle_rule.reward_products = [{ menu_item_id: MENU_ID, allowed_sizes: [],
      default_powder_id: null, default_base_liquid_id: null }];
    mocks.menuFindMany.mockResolvedValue([{ id: MENU_ID, category: "extras", is_available: true }]);

    const response = await POST(request(body) as never);

    expect(response.status).toBe(201);
    expect(mocks.packageCreate).toHaveBeenCalledOnce();
  });

  it("từ chối FIXED_CONFIG đồ uống thiếu size, bột và Base Liquid", async () => {
    const body = payload();
    body.bundle_rule.reward_mode = "FIXED_CONFIG";
    body.bundle_rule.reward_products = [{ menu_item_id: MENU_ID, allowed_sizes: [],
      default_powder_id: null, default_base_liquid_id: null }];
    mocks.menuFindMany.mockResolvedValue([{ id: MENU_ID, category: "latte", is_available: true }]);

    const response = await POST(request(body) as never);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION" });
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
