import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreate = vi.fn();
const mockMilkFindMany = vi.fn();
const mockSizeConfigFindMany = vi.fn();
const mockPowderFindUnique = vi.fn();
const mockTxPowders = vi.fn();
const mockMenuFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    menuItem: { findMany: (...args: unknown[]) => mockMenuFindMany(...args) },
    matchaPowder: { findUnique: (...args: unknown[]) => mockPowderFindUnique(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkFindMany(...args) },
    defaultSizeConfig: { findMany: (...args: unknown[]) => mockSizeConfigFindMany(...args) },
  },
}));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateMenuCaches: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureServerException: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  MENU_IMAGE_OUTPUT_CONTENT_TYPE: "image/webp",
  buildMenuImagePath: vi.fn(),
  uploadMenuImage: vi.fn(),
  removeMenuImages: vi.fn(),
}));

import { GET, POST } from "@/app/api/admin/menu/route";

const createdExtra = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bánh cá",
  description: null,
  category: "extras",
  unit_price_vnd: 25_000,
  image_url: null,
  is_available: true,
  sort_order: 0,
  is_seasonal: false,
  matcha_powder_id: null,
  default_powder_id: null,
  default_base_liquid_id: null,
  custom_powder_grams: null,
  base_liquid_note: null,
  updated_at: new Date("2026-09-08T00:00:00.000Z"),
  sizes: [],
  matchaPowder: null,
  defaultPowder: null,
  fusionAllowedPowders: [],
  allowedBaseLiquids: [],
};

function request(includeSortOrder: boolean): Request {
  const body = new FormData();
  body.set("name", "Bánh cá");
  body.set("category", "extras");
  body.set("unit_price_vnd", "25000");
  body.set("sizes", "[]");
  if (includeSortOrder) body.set("sort_order", "7");
  return new Request("http://localhost/api/admin/menu", { method: "POST", body });
}


const ORIGINAL_ID = "33333333-3333-4333-8333-333333333333";
const LIQUID_ID = "44444444-4444-4444-8444-444444444444";
function fusionRequest(includeOriginal = true): Request {
  const body = new FormData();
  body.set("name", "Fusion");
  body.set("category", "fusion");
  body.set("default_base_liquid_id", LIQUID_ID);
  if (includeOriginal) body.set("default_powder_id", ORIGINAL_ID);
  body.set("sizes", JSON.stringify(["SMALL", "MEDIUM", "LARGE"].map((size) => ({ size, base_price_vnd: 23_000 }))));
  return new Request("http://localhost/api/admin/menu", { method: "POST", body });
}

describe("POST /api/admin/menu - thứ tự món mới", () => {
  const tx = { menuItem: { updateMany: mockUpdateMany, create: mockCreate, findUniqueOrThrow: async () => createdExtra },
    menuItemSize: { createMany: vi.fn() }, matchaPowder: { findMany: (...args: unknown[]) => mockTxPowders(...args) } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockMilkFindMany.mockResolvedValue([]);
    mockSizeConfigFindMany.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 2 });
    mockCreate.mockResolvedValue(createdExtra);
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it("GET cung cấp gram hệ thống và ml để editor suy ngược giá không hardcode", async () => {
    mockMenuFindMany.mockResolvedValue([]);
    mockSizeConfigFindMany.mockResolvedValue([{ size: "SMALL", milk_ml: 130, powder_gram: 3.5 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.default_size_config).toEqual([{ size: "SMALL", base_liquid_ml: 130, powder_gram: 3.5 }]);
  });

  it("đưa món mới lên đầu danh mục khi không truyền sort_order", async () => {
    const response = await POST(request(false));

    expect(response.status).toBe(201);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { category: "extras" },
      data: { sort_order: { increment: 1 } },
    });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sort_order: 0 }),
    }));
  });

  it("giữ compatibility khi client truyền sort_order rõ ràng", async () => {
    await POST(request(true));

    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sort_order: 7 }),
    }));
  });

  it("Fusion không có UUID bột gốc bị từ chối trước transaction", async () => {
    expect((await POST(fusionRequest(false))).status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("Fusion preflight active nhưng bột inactive trong transaction không được tạo", async () => {
    mockMilkFindMany.mockResolvedValue([{ id: LIQUID_ID, is_default: true }]);
    mockPowderFindUnique.mockResolvedValue({ id: ORIGINAL_ID, is_available: true });
    mockTxPowders.mockResolvedValue([{ id: ORIGINAL_ID, is_available: false }]);
    const response = await POST(fusionRequest());
    expect(response.status).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("Fusion hết retry P2034 trả 409", async () => {
    mockMilkFindMany.mockResolvedValue([{ id: LIQUID_ID, is_default: true }]);
    mockPowderFindUnique.mockResolvedValue({ id: ORIGINAL_ID, is_available: true });
    mockTransaction.mockRejectedValue(Object.assign(new Error("serialization"), { code: "P2034" }));
    expect((await POST(fusionRequest())).status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("bột gốc không tồn tại trả details tham chiếu và không ghi", async () => {
    mockPowderFindUnique.mockResolvedValue(null);
    const response = await POST(fusionRequest());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "BUSINESS_RULE_VIOLATION", details: {
      reason: "POWDER_REFERENCE_NOT_FOUND", field: "default_powder_id", powder_ids: [ORIGINAL_ID],
    } });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
