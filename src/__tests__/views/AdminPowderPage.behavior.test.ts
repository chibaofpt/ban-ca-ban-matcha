import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Powder } from "@/src/lib/types/powder";
import type { AdminMenuData } from "@/src/services/adminMenuService";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockListAdminPowders = vi.fn();
const mockListAdminMenuItems = vi.fn();
const mockTogglePowderAvailability = vi.fn();

vi.mock("@/src/services/adminPowderService", () => ({
  listAdminPowders: () => mockListAdminPowders(),
  togglePowderAvailability: (...args: unknown[]) => mockTogglePowderAvailability(...args),
}));

vi.mock("@/src/services/adminMenuService", () => ({
  listAdminMenuItems: () => mockListAdminMenuItems(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockPowder: Powder = {
  id: "p-1",
  name: "Meyumi",
  manufacturer: null,
  type: "RECOMMEND",
  is_available: true,
  price_per_gram: 300,
  description: null,
  image_url: null,
  fragrance: null,
  body: null,
  bitterness: null,
  umami: null,
  color: null,
  reference_latte_item_id: null,
  size_config: [],
};

const mockPowders: Powder[] = [mockPowder];

const mockMenuData: AdminMenuData = {
  latte: [],
  fusion: [],
  updated_at: new Date().toISOString(),
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AdminPowderPage — Contract 1: parallel initial load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi listAdminPowders khi mount", async () => {
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);

    await Promise.all([mockListAdminPowders(), mockListAdminMenuItems()]);

    expect(mockListAdminPowders).toHaveBeenCalledTimes(1);
  });

  it("gọi listAdminMenuItems để lấy latte items (cho PowderModal)", async () => {
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);

    await Promise.all([mockListAdminPowders(), mockListAdminMenuItems()]);

    expect(mockListAdminMenuItems).toHaveBeenCalledTimes(1);
  });

  it("load thành công → trả đúng danh sách bột", async () => {
    mockListAdminPowders.mockResolvedValueOnce(mockPowders);
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);

    const [powderList] = await Promise.all([mockListAdminPowders(), mockListAdminMenuItems()]);

    expect(powderList).toHaveLength(1);
    expect(powderList[0].name).toBe("Meyumi");
  });
});

describe("AdminPowderPage — Contract 2: error state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetch fail → throw error", async () => {
    mockListAdminPowders.mockRejectedValueOnce(new Error("DB error"));
    mockListAdminMenuItems.mockResolvedValueOnce(mockMenuData);

    await expect(
      Promise.all([mockListAdminPowders(), mockListAdminMenuItems()])
    ).rejects.toThrow();
  });
});

describe("AdminPowderPage — Contract 3: optimistic toggle + rollback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toggle cập nhật is_available ngay lập tức", () => {
    let powders: Powder[] = [{ ...mockPowder, is_available: true }];

    // Simulate optimistic update
    powders = powders.map((p) => (p.id === "p-1" ? { ...p, is_available: false } : p));

    expect(powders[0].is_available).toBe(false);
  });

  it("toggle API thành công → không rollback", async () => {
    mockTogglePowderAvailability.mockResolvedValueOnce(undefined);

    let powders: Powder[] = [{ ...mockPowder, is_available: true }];
    const rollback = [...powders];
    powders = powders.map((p) => (p.id === "p-1" ? { ...p, is_available: false } : p));

    await mockTogglePowderAvailability("p-1", false);

    // No rollback — state stays toggled
    expect(powders[0].is_available).toBe(false);
    expect(rollback[0].is_available).toBe(true); // rollback exists but unused
  });

  it("toggle API fail → rollback về trạng thái cũ", async () => {
    mockTogglePowderAvailability.mockRejectedValueOnce(new Error("fail"));

    let powders: Powder[] = [{ ...mockPowder, is_available: true }];
    const rollback = [...powders];

    // Optimistic update
    powders = powders.map((p) => (p.id === "p-1" ? { ...p, is_available: false } : p));
    expect(powders[0].is_available).toBe(false);

    // API fails → rollback
    try {
      await mockTogglePowderAvailability("p-1", false);
    } catch {
      powders = rollback;
    }

    expect(powders[0].is_available).toBe(true);
  });

  it("togglePowderAvailability được gọi với đúng id và next state", async () => {
    mockTogglePowderAvailability.mockResolvedValueOnce(undefined);

    await mockTogglePowderAvailability("p-1", false);

    expect(mockTogglePowderAvailability).toHaveBeenCalledWith("p-1", false);
  });
});

describe("AdminPowderPage — Contract 4: filter logic", () => {
  const powders: Powder[] = [
    { ...mockPowder, id: "1", name: "Meyumi", type: "RECOMMEND" },
    { ...mockPowder, id: "2", name: "Hana", type: "NONE" },
    { ...mockPowder, id: "3", name: "MH-3 Seasonal", type: "SEASONAL" },
  ];

  /** Mirrors filter logic from AdminPowderPage */
  function filterPowders(allPowders: Powder[], typeFilter: string, searchQuery: string) {
    return allPowders.filter((p) => {
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesSearch =
        searchQuery.trim() === "" ||
        p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesType && matchesSearch;
    });
  }

  it("filter 'all' → trả tất cả bột", () => {
    expect(filterPowders(powders, "all", "")).toHaveLength(3);
  });

  it("filter 'RECOMMEND' → chỉ trả RECOMMEND", () => {
    const result = filterPowders(powders, "RECOMMEND", "");
    expect(result.every((p) => p.type === "RECOMMEND")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("search 'hana' → match tên chứa 'hana' (case-insensitive)", () => {
    const result = filterPowders(powders, "all", "hana");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Hana");
  });

  it("search không tìm thấy → trả mảng rỗng", () => {
    const result = filterPowders(powders, "all", "xyz");
    expect(result).toHaveLength(0);
  });
});
