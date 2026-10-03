import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockTransaction = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreate = vi.fn();
const mockMilkFindMany = vi.fn();
const mockSizeConfigFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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

import { POST } from "@/app/api/admin/menu/route";

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

describe("POST /api/admin/menu - thứ tự món mới", () => {
  const tx = { menuItem: { updateMany: mockUpdateMany, create: mockCreate } };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ role: "ADMIN" });
    mockMilkFindMany.mockResolvedValue([]);
    mockSizeConfigFindMany.mockResolvedValue([]);
    mockUpdateMany.mockResolvedValue({ count: 2 });
    mockCreate.mockResolvedValue(createdExtra);
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
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
});
