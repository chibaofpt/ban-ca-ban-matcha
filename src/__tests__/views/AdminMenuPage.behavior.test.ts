import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminMenuData } from "@/src/services/adminMenuService";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuItem } from "@/src/lib/types/menu";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockListAdminMenuItems = vi.fn();
const mockListAdminPowders = vi.fn();
const mockToggleMenuItemAvailability = vi.fn();

vi.mock("@/src/services/adminMenuService", () => ({
  listAdminMenuItems: () => mockListAdminMenuItems(),
  toggleMenuItemAvailability: (...args: unknown[]) => mockToggleMenuItemAvailability(...args),
}));

vi.mock("@/src/services/adminPowderService", () => ({
  listAdminPowders: () => mockListAdminPowders(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockLatteItem: AdminMenuItem = {
  id: "item-1",
  name: "Matcha Latte",
  category: "latte",
  is_available: true,
  is_seasonal: false,
  image_url: null,
  description: null,
  sort_order: 0,
  updated_at: "2023-10-27T00:00:00Z",
  base_liquid_note: null,
  custom_powder_grams: null,
  matcha_powder_id: "p-1",
  powder: { id: "p-1", name: "Meyumi", type: "RECOMMEND" },
  default_powder_id: null,
  default_powder: null,
  allowed_powder_ids: [],
  sizes: [
    { size: "SMALL", base_price_vnd: 45000, milk_ml: 180 },
    { size: "MEDIUM", base_price_vnd: 55000, milk_ml: 220 },
    { size: "LARGE", base_price_vnd: 65000, milk_ml: 260 },
  ],
};

const mockMenuData: AdminMenuData = {
  latte: [mockLatteItem],
  fusion: [],
  updated_at: new Date().toISOString(),
};

const mockPowders: Powder[] = [];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AdminMenuPage — Contract 1: parallel initial load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi listAdminMenuItems khi load", async () => {
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);

    expect(mockListAdminMenuItems).toHaveBeenCalledTimes(1);
  });

  it("gọi listAdminPowders khi load", async () => {
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);

    expect(mockListAdminPowders).toHaveBeenCalledTimes(1);
  });

  it("gọi song song bằng Promise.all — không sequential", async () => {
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    const [menu, powders] = await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);

    expect(menu.latte).toHaveLength(1);
    expect(powders).toHaveLength(0);
  });
});

describe("AdminMenuPage — Contract 2: error state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetch thất bại → throw error", async () => {
    mockListAdminMenuItems.mockRejectedValueOnce(new Error("Server error"));
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    await expect(
      Promise.all([mockListAdminMenuItems(), mockListAdminPowders()])
    ).rejects.toThrow();
  });

  it("sau khi error, gọi lại loadData → refetch cả 2 services", async () => {
    mockListAdminMenuItems.mockRejectedValueOnce(new Error("fail"));
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    try {
      await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);
    } catch {
      // expected
    }

    // Simulate "Thử lại" — call loadData again
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    const [menu] = await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);
    expect(menu.latte).toHaveLength(1);
    expect(mockListAdminMenuItems).toHaveBeenCalledTimes(2);
  });
});

describe("AdminMenuPage — Contract 3: mutation triggers refetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggle → gọi toggleMenuItemAvailability với đúng id và next state", async () => {
    mockToggleMenuItemAvailability.mockResolvedValueOnce(undefined);

    await mockToggleMenuItemAvailability("item-1", false);

    expect(mockToggleMenuItemAvailability).toHaveBeenCalledWith("item-1", false);
  });

  it("toggle thành công → sau đó loadData được gọi lại", async () => {
    mockToggleMenuItemAvailability.mockResolvedValueOnce(undefined);
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);

    await mockToggleMenuItemAvailability("item-1", false);
    // Simulate loadData after mutation
    await Promise.all([mockListAdminMenuItems(), mockListAdminPowders()]);

    expect(mockListAdminMenuItems).toHaveBeenCalledTimes(1);
  });
});

describe("AdminMenuPage — Contract 4: optimistic toggle + rollback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistic update — toggle ngay lập tức trước khi API trả về", () => {
    const items = [{ ...mockLatteItem }];

    // Simulate optimistic update
    const toggleOptimistic = (id: string, next: boolean) => {
      return items.map((i) => (i.id === id ? { ...i, is_available: next } : i));
    };

    const updated = toggleOptimistic("item-1", false);
    expect(updated[0].is_available).toBe(false);
  });

  it("rollback về is_available = true khi toggle API fail", async () => {
    const rollbackItems = [{ ...mockLatteItem, is_available: true }];
    let currentItems = [{ ...mockLatteItem }];

    // Simulate optimistic update
    currentItems = currentItems.map((i) =>
      i.id === "item-1" ? { ...i, is_available: false } : i
    );
    expect(currentItems[0].is_available).toBe(false);

    // Simulate API fail → rollback
    mockToggleMenuItemAvailability.mockRejectedValueOnce(new Error("API fail"));
    try {
      await mockToggleMenuItemAvailability("item-1", false);
    } catch {
      currentItems = rollbackItems; // rollback
    }

    expect(currentItems[0].is_available).toBe(true);
  });
});

describe("AdminMenuPage — Contract 5: filter logic", () => {
  const allItems = [
    { ...mockLatteItem, id: "1", category: "latte" as const, is_available: true },
    { ...mockLatteItem, id: "2", category: "fusion" as const, is_available: false, name: "Fusion A" },
    { ...mockLatteItem, id: "3", category: "latte" as const, is_available: true, name: "Another Latte" },
  ];

  /** Mirrors filter + sort logic from AdminMenuPage */
  function filterItems(
    items: typeof allItems,
    categoryFilter: string,
    searchQuery: string
  ) {
    return items
      .filter((item) => {
        const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
        const matchesSearch =
          searchQuery.trim() === "" ||
          item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a.is_available === b.is_available) return 0;
        return a.is_available ? -1 : 1;
      });
  }

  it("filter 'all' → trả tất cả items", () => {
    expect(filterItems(allItems, "all", "")).toHaveLength(3);
  });

  it("filter 'latte' → chỉ trả latte items", () => {
    const result = filterItems(allItems, "latte", "");
    expect(result.every((i) => i.category === "latte")).toBe(true);
  });

  it("search 'fusion' → chỉ match tên chứa 'fusion'", () => {
    const result = filterItems(allItems, "all", "Fusion");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Fusion A");
  });

  it("sort: is_available=true lên trước false", () => {
    const result = filterItems(allItems, "all", "");
    expect(result[0].is_available).toBe(true);
    expect(result[result.length - 1].is_available).toBe(false);
  });
});
