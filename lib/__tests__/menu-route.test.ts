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

describe("GET /api/menu — contract dữ liệu chuẩn hóa", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMenuItemFindMany.mockResolvedValue([
      {
        id: "latte-1",
        name: "Matcha Latte",
        description: null,
        category: "latte",
        is_seasonal: true,
        image_url: null,
        sort_order: 1,
        base_liquid_note: null,
        custom_powder_grams: null,
        default_powder_id: null,
        updated_at: new Date("2026-07-19T00:00:00.000Z"),
        sizes: [{ size: "SMALL", base_price_vnd: 30000 }],
        fusionAllowedPowders: [],
        matchaPowder: { id: "powder-1", name: "Meyumi", type: "RECOMMEND", is_available: true },
      },
      {
        id: "fusion-1",
        name: "Matcha Cam",
        description: null,
        category: "fusion",
        is_seasonal: false,
        image_url: null,
        sort_order: 2,
        base_liquid_note: "Nước cam",
        custom_powder_grams: null,
        default_powder_id: "powder-1",
        default_base_liquid_id: "milk-inactive",
        updated_at: new Date("2026-07-18T00:00:00.000Z"),
        sizes: [{ size: "SMALL", base_price_vnd: 32000 }],
        fusionAllowedPowders: [],
        matchaPowder: null,
        allowedBaseLiquids: [{
          base_liquid_id: "milk-2",
          baseLiquid: { id: "milk-2", is_active: true },
        }],
      },
    ]);
    mockAddonGroupFindMany.mockResolvedValue([
      {
        id: "addon-group-1",
        name: "Kem",
        image_url: "https://cdn/menu-images/products/addons/kem.webp",
        type: "QUANTITY",
        max_quantity: 3,
        options: [
          {
            id: "addon-option-1",
            label: "Một phần kem",
            image_url: "https://cdn/menu-images/products/addons/kem-sua.webp",
            price_vnd: 5000,
            gram_value: null,
            sort_order: 1,
            is_active: true,
          },
        ],
      },
    ]);
    mockMilkTypeFindMany.mockResolvedValue([
      {
        id: "milk-1",
        name: "Sữa bò",
        price_per_ml: 40,
        is_default: true,
        is_active: true,
        display_order: 1,
      },
      {
        id: "milk-2",
        name: "Sữa hạt",
        price_per_ml: 50,
        is_default: false,
        is_active: true,
        display_order: 2,
      },
    ]);
    mockDefaultSizeConfigFindMany.mockResolvedValue([
      { size: "SMALL", milk_ml: 130 },
    ]);
    mockMatchaPowderFindMany.mockResolvedValue([
      { id: "powder-1", name: "Meyumi", type: "RECOMMEND", price_per_gram: 100, is_available: true },
    ]);
  });

  it("trả addon groups và milk types đúng một lần ở cấp data", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      data: Record<string, unknown> & {
        latte: Record<string, unknown>[];
        fusion: Record<string, unknown>[];
      };
    };

    expect(body.data.addon_groups).toHaveLength(1);
    expect(body.data.addon_groups).toEqual([
      expect.objectContaining({
        image_url: "https://cdn/menu-images/products/addons/kem.webp",
        options: [expect.objectContaining({
          image_url: "https://cdn/menu-images/products/addons/kem-sua.webp",
        })],
      }),
    ]);
    expect(body.data.addon_groups).toEqual([
      expect.not.objectContaining({ is_required: expect.anything(), min_quantity: expect.anything() }),
    ]);
    expect(mockAddonGroupFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          options: expect.objectContaining({ where: { is_active: true } }),
        },
      }),
    );
    expect(body.data.milk_types).toHaveLength(2);
    expect(body.data.latte[0]).not.toHaveProperty("addon_groups");
    expect(body.data.latte[0]).not.toHaveProperty("milk_types");
    expect(body.data.fusion[0]).not.toHaveProperty("addon_groups");
    expect(body.data.fusion[0]).not.toHaveProperty("milk_types");
  });

  it("không trả seasonal bị lặp ngoài contract", async () => {
    const response = await GET();
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(body.data).not.toHaveProperty("seasonal");
  });

  it("Fusion fallback Base Liquid inactive sang allow-list active", async () => {
    const response = await GET();
    const body = (await response.json()) as { data: { fusion: Array<{ default_base_liquid_id: string | null }> } };
    expect(body.data.fusion[0]?.default_base_liquid_id).toBe("milk-2");
    expect(body.data.fusion[0]?.default_base_liquid_id).not.toBe("milk-inactive");
  });

  it("không trả Latte có bột cố định đã inactive và vẫn giữ mốc updated_at", async () => {
    mockMenuItemFindMany.mockResolvedValue([{
      id: "latte-inactive", name: "Latte ngưng bột", description: null, category: "latte",
      is_seasonal: false, image_url: null, sort_order: 1, base_liquid_note: null,
      custom_powder_grams: null, default_powder_id: null,
      updated_at: new Date("2026-08-22T00:00:00.000Z"),
      sizes: [{ size: "SMALL", base_price_vnd: 30_000 }], fusionAllowedPowders: [],
      matchaPowder: { id: "powder-inactive", name: "Bột ngưng", type: "STANDARD", is_available: false },
      allowedBaseLiquids: [],
    }]);

    const response = await GET();
    const body = (await response.json()) as { data: { latte: unknown[]; updated_at: string } };
    expect(body.data.latte).toEqual([]);
    expect(body.data.updated_at).toBe("2026-08-22T00:00:00.000Z");
  });
});
