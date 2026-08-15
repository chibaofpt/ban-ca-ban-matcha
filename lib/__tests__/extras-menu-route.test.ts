import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMenuItemFindMany = vi.fn();
const mockAddonGroupFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockDefaultSizeConfigFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findMany: (...args: unknown[]) => mockMenuItemFindMany(...args) },
    addonGroup: { findMany: (...args: unknown[]) => mockAddonGroupFindMany(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    defaultSizeConfig: {
      findMany: (...args: unknown[]) => mockDefaultSizeConfigFindMany(...args),
    },
    matchaPowder: { findMany: (...args: unknown[]) => mockMatchaPowderFindMany(...args) },
  },
}));

vi.mock("@/lib/cache", () => ({
  CACHE_KEYS: { MENU: "cache:menu:v2" },
  CACHE_TTL: { MENU: 600 },
  withCache: async <T>(
    _key: string,
    _ttl: number,
    fetchFn: () => Promise<T>,
  ): Promise<T> => fetchFn(),
}));

import { GET } from "@/app/api/menu/route";

describe("GET /api/menu — nhóm extras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMenuItemFindMany.mockResolvedValue([
      {
        id: "extra-dessert-1",
        name: "Bánh matcha",
        description: "Dessert dùng riêng",
        category: "extras",
        unit_price_vnd: 26_000,
        is_seasonal: false,
        image_url: null,
        sort_order: 50,
        base_liquid_note: null,
        custom_powder_grams: null,
        default_powder_id: null,
        default_base_liquid_id: null,
        updated_at: new Date("2026-08-15T00:00:00.000Z"),
        sizes: [],
        fusionAllowedPowders: [],
        allowedBaseLiquids: [],
        matchaPowder: null,
      },
    ]);
    mockAddonGroupFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
    mockDefaultSizeConfigFindMany.mockResolvedValue([]);
    mockMatchaPowderFindMany.mockResolvedValue([]);
  });

  it("trả extras riêng sau fusion với giá đơn vị cố định và không có size", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      data: {
        latte: unknown[];
        fusion: unknown[];
        extras: Array<Record<string, unknown>>;
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.extras).toEqual([
      expect.objectContaining({
        id: "extra-dessert-1",
        category: "extras",
        unit_price_vnd: 26_000,
        sizes: [],
      }),
    ]);
    expect(body.data.extras[0]).not.toHaveProperty("powder");
    expect(body.data.extras[0]).not.toHaveProperty("allowed_powder_ids");
    expect(body.data.extras[0]).not.toHaveProperty("allowed_base_liquid_ids");
  });
});
