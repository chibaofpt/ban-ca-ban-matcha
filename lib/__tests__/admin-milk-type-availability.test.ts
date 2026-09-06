import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findMilkType: vi.fn(),
  countFusionDefaults: vi.fn(),
  findMenuItems: vi.fn(),
  findAllowedRows: vi.fn(),
  transaction: vi.fn(),
  updateMilkTypes: vi.fn(),
  updateMilkType: vi.fn(),
  deleteAllowedRows: vi.fn(),
  createAllowedRows: vi.fn(),
  touchMenuItems: vi.fn(),
}));

interface TransactionClientMock {
  milkType: {
    updateMany: typeof mocks.updateMilkTypes;
    update: typeof mocks.updateMilkType;
  };
  menuItemAllowedBaseLiquid: {
    deleteMany: typeof mocks.deleteAllowedRows;
    createMany: typeof mocks.createAllowedRows;
  };
  menuItem: { updateMany: typeof mocks.touchMenuItems };
}

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    milkType: { findUnique: mocks.findMilkType },
    menuItem: {
      count: mocks.countFusionDefaults,
      findMany: mocks.findMenuItems,
    },
    menuItemAllowedBaseLiquid: { findMany: mocks.findAllowedRows },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));
vi.mock("@/lib/catalogImage", () => ({
  catalogImageValidationMessage: () => null,
  prepareCatalogImage: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({
  removeMenuImages: vi.fn(),
  parseMenuImagePath: vi.fn(),
}));

import { PUT } from "@/app/api/admin/milk-types/[id]/route";

const liquidId = "11111111-1111-4111-8111-111111111111";
const latteId = "22222222-2222-4222-8222-222222222222";
const fusionId = "33333333-3333-4333-8333-333333333333";
const previousItemId = "44444444-4444-4444-8444-444444444444";
const extrasId = "55555555-5555-4555-8555-555555555555";

function makeRequest(availableMenuItemIds: string[]): Request {
  return new Request(`http://localhost/api/admin/milk-types/${liquidId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Sữa Oat",
      price_per_ml: 45,
      is_default: false,
      is_active: true,
      available_menu_item_ids: availableMenuItemIds,
    }),
  });
}

function makePartialRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/milk-types/${liquidId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/milk-types/[id] — phạm vi món", () => {
  const tx: TransactionClientMock = {
    milkType: {
      updateMany: mocks.updateMilkTypes,
      update: mocks.updateMilkType,
    },
    menuItemAllowedBaseLiquid: {
      deleteMany: mocks.deleteAllowedRows,
      createMany: mocks.createAllowedRows,
    },
    menuItem: { updateMany: mocks.touchMenuItems },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ role: "ADMIN" });
    mocks.findMilkType.mockResolvedValue({
      id: liquidId,
      name: "Sữa Oat",
      price_per_ml: 40,
      is_default: false,
      is_active: true,
      image_url: null,
    });
    mocks.countFusionDefaults.mockResolvedValue(0);
    mocks.findAllowedRows.mockResolvedValue([{ menu_item_id: previousItemId }]);
    mocks.updateMilkType.mockResolvedValue({ id: liquidId, name: "Sữa Oat" });
    mocks.deleteAllowedRows.mockResolvedValue({ count: 1 });
    mocks.createAllowedRows.mockResolvedValue({ count: 1 });
    mocks.touchMenuItems.mockResolvedValue({ count: 3 });
    mocks.transaction.mockImplementation(
      async (callback: (client: TransactionClientMock) => Promise<unknown>) => callback(tx),
    );
  });

  it("đồng bộ row allowed và không ghi trùng default implicit của Fusion", async () => {
    mocks.findMenuItems.mockResolvedValue([
      { id: latteId, category: "latte", default_base_liquid_id: null },
      { id: fusionId, category: "fusion", default_base_liquid_id: liquidId },
    ]);

    const response = await PUT(makeRequest([latteId, fusionId]), {
      params: Promise.resolve({ id: liquidId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteAllowedRows).toHaveBeenCalledWith({
      where: { base_liquid_id: liquidId },
    });
    expect(mocks.createAllowedRows).toHaveBeenCalledWith({
      data: [{ menu_item_id: latteId, base_liquid_id: liquidId }],
    });
    expect(mocks.touchMenuItems).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { id: { in: expect.arrayContaining([previousItemId, latteId, fusionId]) } },
        ]),
      }),
      data: { updated_at: expect.any(Date) },
    });
  });

  it("từ chối ID extras hoặc món không tồn tại", async () => {
    mocks.findMenuItems.mockResolvedValue([]);

    const response = await PUT(makeRequest([extrasId]), {
      params: Promise.resolve({ id: liquidId }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("xóa row Latte trùng khi đổi thành global default mà không gửi phạm vi món", async () => {
    const response = await PUT(makePartialRequest({ is_default: true }), {
      params: Promise.resolve({ id: liquidId }),
    });

    expect(response.status).toBe(200);
    expect(mocks.deleteAllowedRows).toHaveBeenCalledWith({
      where: {
        base_liquid_id: liquidId,
        menuItem: { category: "latte" },
      },
    });
    expect(mocks.createAllowedRows).not.toHaveBeenCalled();
  });
});
