import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockOptionFindFirst = vi.fn();
const mockTxOptionFindFirst = vi.fn();
const mockGroupFindUnique = vi.fn();
const mockGroupFindUniqueOrThrow = vi.fn();
const mockOptionAggregate = vi.fn();
const mockOptionCreate = vi.fn();
const mockOptionUpdate = vi.fn();
const mockOptionCount = vi.fn();
const mockPrepareCatalogImage = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    addonOption: { findFirst: (...args: unknown[]) => mockOptionFindFirst(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
vi.mock("@/lib/catalogImage", () => ({
  prepareCatalogImage: (...args: unknown[]) => mockPrepareCatalogImage(...args),
  catalogImageValidationMessage: () => null,
}));
vi.mock("@/lib/storage", () => ({ removeMenuImages: vi.fn() }));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));

import { POST } from "@/app/api/admin/addon-groups/[id]/options/route";
import { PUT } from "@/app/api/admin/addon-groups/[id]/options/[optionId]/route";

const groupId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";

const groupResult = {
  id: groupId,
  name: "Kem",
  description: null,
  image_url: null,
  sort_order: 0,
  max_select: 1,
  is_dynamic_gram: false,
  is_active: true,
  created_at: new Date("2026-09-05T00:00:00.000Z"),
  options: [{
    id: optionId,
    addon_group_id: groupId,
    label: "Kem sua",
    image_url: null,
    price_vnd: 10_000,
    is_active: true,
    sort_order: 3,
    gram_value: null,
  }],
};

function multipartRequest(payload: Record<string, unknown>, method: "POST" | "PUT"): Request {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  return new Request("http://localhost/api/admin/addon-groups/options", { method, body: formData });
}

describe("Admin add-on option routes", () => {
  const tx = {
    addonGroup: {
      findUnique: mockGroupFindUnique,
      findUniqueOrThrow: mockGroupFindUniqueOrThrow,
    },
    addonOption: {
      findFirst: mockTxOptionFindFirst,
      aggregate: mockOptionAggregate,
      create: mockOptionCreate,
      update: mockOptionUpdate,
      count: mockOptionCount,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockPrepareCatalogImage.mockResolvedValue({ imageUrl: undefined, newPath: null, oldPath: null });
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    mockGroupFindUnique.mockResolvedValue({
      id: groupId,
      name: "Kem",
      is_dynamic_gram: false,
      is_active: true,
    });
    mockGroupFindUniqueOrThrow.mockResolvedValue(groupResult);
    mockOptionAggregate.mockResolvedValue({ _max: { sort_order: 3 } });
    mockOptionCreate.mockResolvedValue({ id: optionId });
    mockOptionUpdate.mockResolvedValue({ id: optionId });
    mockOptionCount.mockResolvedValue(1);
    mockOptionFindFirst.mockResolvedValue({
      ...groupResult.options[0],
      group: { id: groupId, name: "Kem", is_dynamic_gram: false, is_active: true },
    });
    mockTxOptionFindFirst.mockResolvedValue({
      ...groupResult.options[0],
      group: { id: groupId, name: "Kem", is_dynamic_gram: false, is_active: true },
    });
  });

  it("appends a new option after inactive and active siblings", async () => {
    const response = await POST(multipartRequest({
      label: "Kem matcha",
      price_vnd: 12_000,
      gram_value: null,
      is_active: true,
    }, "POST"), { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(201);
    expect(mockOptionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ addon_group_id: groupId, sort_order: 4 }),
    });
    expect((await response.json()).data.id).toBe(groupId);
  });

  it("updates option details without changing activation or order", async () => {
    const response = await PUT(multipartRequest({
      label: "Kem sua moi",
      price_vnd: 11_000,
      gram_value: null,
    }, "PUT"), { params: Promise.resolve({ id: groupId, optionId }) });

    expect(response.status).toBe(200);
    expect(mockOptionUpdate).toHaveBeenCalledWith({
      where: { id: optionId },
      data: expect.not.objectContaining({ is_active: expect.anything(), sort_order: expect.anything() }),
    });
  });

  it("đọc lại trạng thái trong transaction trước khi ẩn option cuối cùng", async () => {
    mockOptionFindFirst.mockResolvedValue({
      ...groupResult.options[0],
      group: { id: groupId, name: "Kem", is_dynamic_gram: false, is_active: false },
    });
    mockTxOptionFindFirst.mockResolvedValue({
      ...groupResult.options[0],
      group: { id: groupId, name: "Kem", is_dynamic_gram: false, is_active: true },
    });
    const response = await PUT(new Request("http://localhost/api/admin/addon-groups/options", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    }), { params: Promise.resolve({ id: groupId, optionId }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Nhóm đang hiển thị phải có ít nhất một option đang bật",
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ACTIVE_GROUP_REQUIRES_ACTIVE_OPTION" },
    });
    expect(mockOptionUpdate).not.toHaveBeenCalled();
  });

  it("trả business-rule code và thông báo rõ khi option sai kiểu giá", async () => {
    mockOptionFindFirst.mockResolvedValue({
      ...groupResult.options[0],
      group: { id: groupId, name: "Extra matcha", is_dynamic_gram: true, is_active: true },
    });

    const response = await PUT(multipartRequest({
      label: "Một gram",
      price_vnd: 10_000,
      gram_value: null,
    }, "PUT"), { params: Promise.resolve({ id: groupId, optionId }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "DYNAMIC_GRAM_OPTION_REQUIRES_GRAMS" },
    });
  });

  it("trả business-rule code khi tạo option sai kiểu giá", async () => {
    mockGroupFindUnique.mockResolvedValue({
      id: groupId,
      name: "Extra matcha",
      is_dynamic_gram: true,
      is_active: true,
    });

    const response = await POST(multipartRequest({
      label: "Một gram",
      price_vnd: 10_000,
      gram_value: null,
      is_active: true,
    }, "POST"), { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "DYNAMIC_GRAM_OPTION_REQUIRES_GRAMS" },
    });
  });
});
