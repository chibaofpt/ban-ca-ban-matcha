import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock apiClient before importing service
vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import { fetchMenu, fetchMenuItems } from "@/src/services/menuService";
import type { MenuItem, MenuData } from "@/src/lib/types/menu";

const mockLatteItem: MenuItem = {
  id: "item-1",
  name: "Matcha Latte",
  description: null,
  category: "latte",
  is_seasonal: false,
  image_url: null,
  sort_order: 0,
  base_liquid_note: null,
  custom_powder_grams: null,
  powder: { id: "powder-1", name: "Meyumi", type: "RECOMMEND" },
  resolved_default_powder_id: null,
  allowed_powder_ids: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 45000, milk_ml: 180 },
    { size: "MEDIUM", base_price_vnd: 55000, milk_ml: 220 },
    { size: "LARGE", base_price_vnd: 65000, milk_ml: 260 },
  ],
};

const mockFusionItem: MenuItem = {
  id: "item-2",
  name: "Matcha Cam",
  description: "Fusion vị cam",
  category: "fusion",
  is_seasonal: false,
  image_url: null,
  sort_order: 1,
  base_liquid_note: "Nước ép cam",
  custom_powder_grams: null,
  powder: null,
  resolved_default_powder_id: "powder-1",
  allowed_powder_ids: ["powder-1", "powder-2"],
  sizes: [
    { size: "SMALL", base_price_vnd: 50000, milk_ml: 0 },
    { size: "MEDIUM", base_price_vnd: 60000, milk_ml: 0 },
    { size: "LARGE", base_price_vnd: 70000, milk_ml: 0 },
  ],
};

const mockMenuData: MenuData = {
  updated_at: "2026-01-01T00:00:00.000Z",
  latte: [mockLatteItem],
  fusion: [mockFusionItem],
  milk_types: [
    { id: "milk-1", name: "Sữa bò", price_per_ml: 40, is_default: true, display_order: 1 },
  ],
  addon_groups: [],
};

describe("fetchMenu", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns full MenuData with latte and fusion arrays", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: mockMenuData },
    });

    const result = await fetchMenu();

    expect(result.latte).toHaveLength(1);
    expect(result.fusion).toHaveLength(1);
    expect(result.milk_types).toHaveLength(1);
    expect(result.addon_groups).toEqual([]);
    expect(result.updated_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("calls correct endpoint GET /api/menu", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: mockMenuData },
    });

    await fetchMenu();

    expect(apiClient.get).toHaveBeenCalledWith("/api/menu");
  });
});

describe("fetchMenuItems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flattens latte + fusion into a single MenuItem[]", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: mockMenuData },
    });

    const result = await fetchMenuItems();

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("latte");
    expect(result[1].category).toBe("fusion");
  });

  it("latte item has 3 sizes with base_price_vnd and milk_ml", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { ...mockMenuData, fusion: [] } },
    });

    const result = await fetchMenuItems();
    const latte = result.find((i) => i.category === "latte");

    expect(latte).toBeDefined();
    expect(latte!.sizes).toHaveLength(3);
    expect(latte!.sizes.map((s) => s.size)).toEqual(["SMALL", "MEDIUM", "LARGE"]);
    expect(latte!.sizes[1].base_price_vnd).toBe(55000);
    expect(latte!.sizes[1].milk_ml).toBe(220);
  });

  it("fusion item has resolved_default_powder_id and allowed_powder_ids", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { ...mockMenuData, latte: [] } },
    });

    const result = await fetchMenuItems();
    const fusion = result.find((i) => i.category === "fusion");

    expect(fusion).toBeDefined();
    expect(fusion!.resolved_default_powder_id).toBe("powder-1");
    expect(fusion!.allowed_powder_ids).toEqual(["powder-1", "powder-2"]);
  });

  it("throws error if API fails", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Network error"));

    await expect(fetchMenuItems()).rejects.toThrow();
  });
});
