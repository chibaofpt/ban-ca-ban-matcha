import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockMenuItemFindUnique = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();
const mockTransaction = vi.fn();
const mockMenuItemUpdate = vi.fn();
const mockMenuItemFindUniqueOrThrow = vi.fn();
const mockAllowedBaseLiquidDeleteMany = vi.fn();
const mockAllowedBaseLiquidCreateMany = vi.fn();
const mockPowders = vi.fn().mockResolvedValue([{ id: "55555555-5555-4555-8555-555555555555", is_available: true }]);

const transactionClient = {
  menuItem: {
    update: (...args: unknown[]) => mockMenuItemUpdate(...args),
    findUniqueOrThrow: (...args: unknown[]) => mockMenuItemFindUniqueOrThrow(...args),
  },
  menuItemSize: { upsert: vi.fn() },
  menuItemAllowedBaseLiquid: {
    deleteMany: (...args: unknown[]) => mockAllowedBaseLiquidDeleteMany(...args),
    createMany: (...args: unknown[]) => mockAllowedBaseLiquidCreateMany(...args),
  },
  fusionAllowedPowder: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  matchaPowder: {
    findMany: (...args: unknown[]) => mockPowders(...args),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findUnique: (...args: unknown[]) => mockMenuItemFindUnique(...args) },
    voucher: { count: vi.fn() },
    matchaPowder: { findMany: (...args: unknown[]) => mockPowders(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    defaultSizeConfig: {
      findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureServerException: vi.fn() }));
vi.mock("@/lib/catalog/adminMenuDto", () => ({
  ADMIN_MENU_INCLUDE: {},
  formatAdminMenuItem: (item: unknown) => item,
}));
vi.mock("@/lib/storage", () => ({
  MENU_IMAGE_OUTPUT_CONTENT_TYPE: "image/webp",
  buildMenuImagePath: vi.fn(),
  contentTypeForMenuImagePath: vi.fn(),
  copyMenuImage: vi.fn(),
  parseMenuImagePath: vi.fn(),
  removeMenuImages: vi.fn(),
  uploadMenuImage: vi.fn(),
}));

import { PUT } from "@/app/api/admin/menu/[id]/route";

const MENU_ITEM_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_LIQUID_ID = "22222222-2222-4222-8222-222222222222";
const INACTIVE_DEFAULT_ID = "33333333-3333-4333-8333-333333333333";
const INACTIVE_ALLOWED_ID = "44444444-4444-4444-8444-444444444444";

function updateRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/menu/${MENU_ITEM_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/menu/[id] - Base Liquid inactive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
    mockMenuItemFindUnique.mockResolvedValue({
      id: MENU_ITEM_ID,
      category: "fusion",
      unit_price_vnd: null,
      default_base_liquid_id: INACTIVE_DEFAULT_ID,
      matcha_powder_id: null,
      default_powder_id: "55555555-5555-4555-8555-555555555555", replacement_powder_id: null,
      is_available: true,
    });
    mockDefaultSizeConfigFindMany.mockResolvedValue([]);
    mockMenuItemUpdate.mockResolvedValue({ id: MENU_ITEM_ID });
    mockMenuItemFindUniqueOrThrow.mockResolvedValue({ id: MENU_ITEM_ID, sizes: [], category: "fusion",
      default_powder_id: "55555555-5555-4555-8555-555555555555", replacement_powder_id: null });
    mockAllowedBaseLiquidDeleteMany.mockResolvedValue({ count: 0 });
    mockAllowedBaseLiquidCreateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    );
    mockMilkTypeFindMany.mockImplementation(
      async (args?: { where?: { is_active?: boolean } }) => {
        if (args?.where?.is_active === true) {
          return [{ id: ACTIVE_LIQUID_ID, is_default: true, is_active: true }];
        }
        return [
          { id: ACTIVE_LIQUID_ID, is_default: true, is_active: true },
          { id: INACTIVE_DEFAULT_ID, is_default: false, is_active: false },
          { id: INACTIVE_ALLOWED_ID, is_default: false, is_active: false },
        ];
      },
    );
  });

  it("cho phép giữ default và allow-list Base Liquid inactive còn tồn tại", async () => {
    const response = await PUT(updateRequest({
      category: "fusion",
      name: "Fusion mới",
      default_base_liquid_id: INACTIVE_DEFAULT_ID,
      allowed_base_liquid_ids: [INACTIVE_ALLOWED_ID],
    }), { params: Promise.resolve({ id: MENU_ITEM_ID }) });

    expect(response.status).toBe(200);
    expect(mockMenuItemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ default_base_liquid_id: INACTIVE_DEFAULT_ID }),
    }));
    expect(mockAllowedBaseLiquidCreateMany).toHaveBeenCalledWith({
      data: [{ menu_item_id: MENU_ITEM_ID, base_liquid_id: INACTIVE_ALLOWED_ID }],
    });
  });

  it.each([
    { default_base_liquid_id: "55555555-5555-4555-8555-555555555555" },
    { allowed_base_liquid_ids: ["55555555-5555-4555-8555-555555555555"] },
  ])("từ chối Base Liquid không tồn tại trước transaction: %j", async (body) => {
    const response = await PUT(updateRequest(body), { params: Promise.resolve({ id: MENU_ITEM_ID }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION" });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("bỏ qua allow-list giữ relation và [] xóa relation Base Liquid", async () => {
    const omitted = await PUT(updateRequest({ name: "Fusion mới" }), { params: Promise.resolve({ id: MENU_ITEM_ID }) });
    expect(omitted.status).toBe(200);
    expect(mockAllowedBaseLiquidDeleteMany).not.toHaveBeenCalled();
    const cleared = await PUT(updateRequest({ allowed_base_liquid_ids: [] }), { params: Promise.resolve({ id: MENU_ITEM_ID }) });
    expect(cleared.status).toBe(200);
    expect(mockAllowedBaseLiquidDeleteMany).toHaveBeenCalledWith({ where: { menu_item_id: MENU_ITEM_ID } });
    expect(mockAllowedBaseLiquidCreateMany).not.toHaveBeenCalled();
  });

  it("quick toggle vẫn cập nhật Fusion chưa cấu hình default Base Liquid", async () => {
    mockMenuItemFindUnique.mockResolvedValue({
      id: MENU_ITEM_ID, category: "fusion", unit_price_vnd: null,
      default_base_liquid_id: null, matcha_powder_id: null, is_available: true,
    });
    const response = await PUT(updateRequest({ is_available: false }), { params: Promise.resolve({ id: MENU_ITEM_ID }) });
    expect(response.status).toBe(200);
    expect(mockMenuItemUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ is_available: false }) }));
  });
});
