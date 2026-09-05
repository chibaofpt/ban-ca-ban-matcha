import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockAddonGroupFindUnique = vi.fn();
const mockAddonGroupFindMany = vi.fn();
const mockAddonGroupUpdate = vi.fn();
const mockGroupCreate = vi.fn();
const mockGroupUpdate = vi.fn();
const mockGroupAggregate = vi.fn();
const mockOptionCreateMany = vi.fn();
const mockOptionCreate = vi.fn();
const mockOptionUpdate = vi.fn();
const mockFindUniqueOrThrow = vi.fn();
const mockPrepareCatalogImage = vi.fn();
const mockRemoveMenuImages = vi.fn();

interface TransactionClientMock {
  addonGroup: {
    create: typeof mockGroupCreate;
    update: typeof mockGroupUpdate;
    aggregate: typeof mockGroupAggregate;
    findUnique: typeof mockAddonGroupFindUnique;
    findUniqueOrThrow: typeof mockFindUniqueOrThrow;
  };
  addonOption: {
    createMany: typeof mockOptionCreateMany;
    create: typeof mockOptionCreate;
    update: typeof mockOptionUpdate;
  };
}

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    addonGroup: {
      findUnique: (...args: unknown[]) => mockAddonGroupFindUnique(...args),
      findMany: (...args: unknown[]) => mockAddonGroupFindMany(...args),
      update: (...args: unknown[]) => mockAddonGroupUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/catalogImage", () => ({
  prepareCatalogImage: (...args: unknown[]) => mockPrepareCatalogImage(...args),
  catalogImageValidationMessage: () => null,
}));

vi.mock("@/lib/storage", () => ({
  removeMenuImages: (...args: unknown[]) => mockRemoveMenuImages(...args),
}));

vi.mock("@/lib/cacheInvalidation", () => ({
  invalidateMenuCaches: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/addon-groups/route";
import { PUT } from "@/app/api/admin/addon-groups/[id]/route";

const groupId = "11111111-1111-4111-8111-111111111111";
const optionId = "22222222-2222-4222-8222-222222222222";

function makeRequest(
  options: Array<Record<string, unknown>>,
  images: Array<{ key: string; name: string }> = [],
  payloadOverrides: Record<string, unknown> = {},
): Request {
  const formData = new FormData();
  formData.set("payload", JSON.stringify({
    name: "Kem",
    description: null,
    max_select: 1, is_dynamic_gram: false,
    max_quantity: null,
    is_active: true,
    options,
    ...payloadOverrides,
  }));
  for (const image of images) {
    formData.set(
      `option_image_${image.key}`,
      new File([image.name], `${image.name}.webp`, { type: "image/webp" }),
    );
  }
  return new Request("http://localhost/api/admin/addon-groups", { method: "POST", body: formData });
}

describe("Admin addon groups — ảnh riêng theo option", () => {
  const tx: TransactionClientMock = {
    addonGroup: {
      create: mockGroupCreate,
      update: mockGroupUpdate,
      aggregate: mockGroupAggregate,
      findUnique: mockAddonGroupFindUnique,
      findUniqueOrThrow: mockFindUniqueOrThrow,
    },
    addonOption: {
      createMany: mockOptionCreateMany,
      create: mockOptionCreate,
      update: mockOptionUpdate,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddonGroupFindUnique.mockReset();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockRemoveMenuImages.mockResolvedValue(undefined);
    mockGroupCreate.mockResolvedValue({ id: groupId });
    mockGroupAggregate.mockResolvedValue({ _max: { sort_order: 4 } });
    mockGroupUpdate.mockResolvedValue({ id: groupId });
    mockAddonGroupUpdate.mockResolvedValue({ id: groupId });
    mockOptionCreateMany.mockResolvedValue({ count: 2 });
    mockOptionCreate.mockResolvedValue({ id: optionId });
    mockOptionUpdate.mockResolvedValue({ id: optionId });
    mockTransaction.mockImplementation(
      async (callback: (client: TransactionClientMock) => Promise<unknown>) => callback(tx),
    );
    mockPrepareCatalogImage.mockImplementation(async ({ entityName, imageFile }: { entityName: string; imageFile: File | null }) => {
      if (!imageFile) return { imageUrl: undefined, newPath: null, oldPath: null };
      const slug = entityName.includes("Kem sữa") ? "kem-sua" : "kem-matcha";
      return {
        imageUrl: `https://cdn/menu-images/products/addons/${slug}.webp`,
        newPath: `products/addons/${slug}.webp`,
        oldPath: null,
      };
    });
  });

  it("GET returns the full catalogue in stable group and option order", async () => {
    mockAddonGroupFindMany.mockResolvedValue([{
      id: groupId,
      name: "Kem",
      description: null,
      image_url: null,
      sort_order: 3,
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
        sort_order: 2,
        gram_value: null,
      }],
    }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({ sort_order: 3 });
    expect(mockAddonGroupFindMany).toHaveBeenCalledWith({
      include: { options: { orderBy: [{ sort_order: "asc" }, { id: "asc" }] } },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    });
  });

  it("POST lưu đúng URL cho từng option trong một transaction", async () => {
    const options = [
      { image_key: "cream", label: "Kem sữa", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null },
      { image_key: "matcha", label: "Kem matcha", price_vnd: 12_000, is_active: true, sort_order: 1, gram_value: null },
    ];
    mockFindUniqueOrThrow.mockResolvedValue({
      id: groupId,
      name: "Kem",
      description: null,
      image_url: null,
      max_select: 1, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      created_at: new Date(),
      options: [
        { id: optionId, addon_group_id: groupId, label: "Kem sữa", image_url: "https://cdn/menu-images/products/addons/kem-sua.webp", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null },
      ],
    });

    const response = await POST(makeRequest(options, [
      { key: "cream", name: "cream" },
      { key: "matcha", name: "matcha" },
    ]));

    expect(response.status).toBe(201);
    expect(mockOptionCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ image_url: "https://cdn/menu-images/products/addons/kem-sua.webp" }),
        expect.objectContaining({ image_url: "https://cdn/menu-images/products/addons/kem-matcha.webp" }),
      ]),
    });
    expect(mockGroupCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sort_order: 5 }),
    }));
  });

  it("PUT compatibility payload cannot change the pricing type", async () => {
    mockAddonGroupFindUnique.mockResolvedValue({
      id: groupId,
      name: "Kem",
      image_url: null,
      is_dynamic_gram: false,
      options: [],
    });

    const response = await PUT(makeRequest([
      { label: "1g", price_vnd: 0, is_active: true, sort_order: 0, gram_value: 1 },
    ], [], { is_dynamic_gram: true }), { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ADDON_PRICING_TYPE_IMMUTABLE" },
    });
    expect(mockPrepareCatalogImage).not.toHaveBeenCalled();
  });

  it("PUT accepts a narrow group details payload without replacing options", async () => {
    const existing = {
      id: groupId,
      name: "Kem",
      description: null,
      image_url: null,
      sort_order: 2,
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
        sort_order: 0,
        gram_value: null,
      }],
    };
    mockAddonGroupFindUnique.mockResolvedValue(existing);
    mockAddonGroupUpdate.mockResolvedValue({ ...existing, name: "Kem sua" });
    const formData = new FormData();
    formData.set("payload", JSON.stringify({
      name: "Kem sua",
      description: "Danh cho latte",
      max_select: 2,
    }));

    const response = await PUT(new Request("http://localhost/api/admin/addon-groups", {
      method: "PUT",
      body: formData,
    }), { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(200);
    expect(mockAddonGroupUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Kem sua", max_select: 2 }),
    }));
    expect(mockOptionUpdate).not.toHaveBeenCalled();
  });

  it("đọc lại option trong transaction trước khi bật group", async () => {
    mockAddonGroupFindUnique.mockResolvedValue({
      id: groupId,
      is_active: false,
      options: [{ id: optionId, is_active: true }],
    });
    mockAddonGroupFindUnique
      .mockResolvedValueOnce({
        id: groupId,
        is_active: false,
        options: [{ id: optionId, is_active: true }],
      })
      .mockResolvedValueOnce({
        id: groupId,
        is_active: false,
        options: [{ id: optionId, is_active: false }],
      });
    const response = await PUT(new Request("http://localhost/api/admin/addon-groups", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    }), { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "Nhóm đang hiển thị phải có ít nhất một option đang bật",
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ACTIVE_GROUP_REQUIRES_ACTIVE_OPTION" },
    });
    expect(mockAddonGroupUpdate).not.toHaveBeenCalled();
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("POST xóa mọi object mới nếu transaction thất bại", async () => {
    mockTransaction.mockRejectedValueOnce(new Error("database failed"));
    const response = await POST(makeRequest([
      { image_key: "cream", label: "Kem sữa", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null },
    ], [{ key: "cream", name: "cream" }]));

    expect(response.status).toBe(500);
    expect(mockRemoveMenuImages).toHaveBeenCalledWith(["products/addons/kem-sua.webp"]);
  });

  it("POST từ chối file có image_key không thuộc option payload", async () => {
    const response = await POST(makeRequest([
      { image_key: "cream", label: "Kem sữa", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null },
    ], [{ key: "unknown", name: "unknown" }]));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
    expect(mockPrepareCatalogImage).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("PUT thay URL của option và chỉ xóa ảnh cũ sau khi commit", async () => {
    mockAddonGroupFindUnique.mockResolvedValue({
      id: groupId,
      name: "Kem",
      image_url: null,
      is_dynamic_gram: false,
      options: [{ id: optionId, image_url: "https://cdn/menu-images/products/addons/old.webp" }],
    });
    mockPrepareCatalogImage.mockImplementation(async ({ imageFile, currentImageUrl }: { imageFile: File | null; currentImageUrl: string | null }) => {
      if (!imageFile) return { imageUrl: undefined, newPath: null, oldPath: null };
      return {
        imageUrl: "https://cdn/menu-images/products/addons/new.webp",
        newPath: "products/addons/new.webp",
        oldPath: currentImageUrl ? "products/addons/old.webp" : null,
      };
    });
    mockFindUniqueOrThrow.mockResolvedValue({
      id: groupId,
      name: "Kem",
      description: null,
      image_url: null,
      max_select: 1, is_dynamic_gram: false,
      max_quantity: null,
      is_active: true,
      created_at: new Date(),
      options: [{ id: optionId, addon_group_id: groupId, label: "Kem sữa", image_url: "https://cdn/menu-images/products/addons/new.webp", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null }],
    });
    const request = makeRequest([
      { id: optionId, image_key: optionId, label: "Kem sữa", price_vnd: 10_000, is_active: true, sort_order: 0, gram_value: null },
    ], [{ key: optionId, name: "new" }]);

    const response = await PUT(request, { params: Promise.resolve({ id: groupId }) });

    expect(response.status).toBe(200);
    expect(mockOptionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ image_url: "https://cdn/menu-images/products/addons/new.webp" }),
    }));
    expect(mockRemoveMenuImages).toHaveBeenCalledWith(["products/addons/old.webp"]);
  });
});
