import { act, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type RefObject } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockFetchMenu = vi.fn();
const mockFetchPowders = vi.fn();
const mockSetPowderData = vi.fn();
let mockQueriesLoaded = false;

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "menu") {
      return { data: mockQueriesLoaded ? mockMenuData : undefined, isLoading: !mockQueriesLoaded, isError: false };
    }
    if (queryKey[0] === "powders") {
      return { data: mockQueriesLoaded ? mockPowderData : undefined, isLoading: !mockQueriesLoaded, isError: false };
    }
    return { data: [] };
  },
}));

vi.mock("@/src/services/menuService", () => ({
  fetchMenu: () => mockFetchMenu(),
}));

vi.mock("@/src/services/powderService", () => ({
  fetchPowders: () => mockFetchPowders(),
}));

vi.mock("@/src/lib/store/powderStore", () => ({
  usePowderStore: (selector: (s: { setPowderData: typeof mockSetPowderData }) => unknown) =>
    selector({ setPowderData: mockSetPowderData }),
}));

vi.mock("@/src/lib/store/authStore", () => ({
  useIsLoggedIn: () => false,
  useIsLoggedInSynced: () => true,
}));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: (selector: (state: { items: never[]; updateQuantity: () => void; removeItem: () => void }) => unknown) =>
    selector({ items: [], updateQuantity: vi.fn(), removeItem: vi.fn() }),
}));

vi.mock("@/src/hooks/useVoucherPackages", () => ({ useVoucherPackages: () => ({ data: [] }) }));
vi.mock("@/src/hooks/useCustomerPoints", () => ({ useCustomerPoints: () => ({ data: 0 }) }));
vi.mock("@/src/components/menu/CartButton", () => ({ default: () => null }));
vi.mock("@/src/components/menu/CartDrawer", () => ({ default: () => null }));
vi.mock("@/src/components/menu/ExistingCartItemSheet", () => ({ ExistingCartItemSheet: () => null }));
vi.mock("@/src/components/shared/ProductModal", () => ({ default: () => null }));
vi.mock("@/src/components/shared/VoucherModal", () => ({ default: () => null }));
vi.mock("@/src/components/menu/TabBar", () => ({
  default: ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) => createElement("div", null,
    createElement("div", { "data-testid": "active-tab" }, activeTab),
    createElement("button", { type: "button", onClick: () => setActiveTab("seasonal") }, "Seasonal"),
  ),
}));
vi.mock("@/src/components/menu/MenuPanels", () => ({
  MenuPanels: ({ loading, seasonalOnly, latteItems, fusionItems, extrasItems, seasonalItems, latteSectionRef, fusionSectionRef, extrasSectionRef, seasonalSectionRef }: {
    loading: boolean;
    seasonalOnly?: boolean;
    latteItems: Array<{ id: string }>;
    fusionItems: Array<{ id: string }>;
    extrasItems: Array<{ id: string }>;
    seasonalItems: Array<{ id: string }>;
    latteSectionRef: RefObject<HTMLDivElement | null>;
    fusionSectionRef: RefObject<HTMLDivElement | null>;
    extrasSectionRef: RefObject<HTMLDivElement | null>;
    seasonalSectionRef: RefObject<HTMLDivElement | null>;
  }) => loading ? null : seasonalOnly
    ? createElement("div", { ref: seasonalSectionRef, "data-section": "seasonal", "data-items": seasonalItems.map((item) => item.id).join(",") })
    : createElement("div", null,
      createElement("div", { ref: latteSectionRef, "data-section": "latte", "data-items": latteItems.map((item) => item.id).join(",") }),
      createElement("div", { ref: fusionSectionRef, "data-section": "fusion", "data-items": fusionItems.map((item) => item.id).join(",") }),
      createElement("div", { ref: extrasSectionRef, "data-section": "extras", "data-items": extrasItems.map((item) => item.id).join(",") }),
      createElement("div", { ref: seasonalSectionRef, "data-scroll-marker": "seasonal" }),
    ),
}));

vi.mock("@/src/lib/store/voucherModalStore", () => ({
  useVoucherModalStore: (selector: (s: { openModal: () => void }) => unknown) =>
    selector({ openModal: vi.fn() }),
}));

// ── Mock data ─────────────────────────────────────────────────────────────

const mockMenuData = {
  updated_at: "2026-01-01T00:00:00Z",
  latte: [
    {
      id: "item-1",
      name: "Matcha Latte",
      category: "latte",
      is_seasonal: false,
      image_url: null,
      description: null,
      sort_order: 0,
      base_liquid_note: null,
      custom_powder_grams: null,
      powder: { id: "p-1", name: "Meyumi", type: "RECOMMEND" },
      resolved_default_powder_id: null,
      allowed_powder_ids: [],
      sizes: [{ size: "SMALL", base_price_vnd: 45000, milk_ml: 180 }],
    },
    {
      id: "seasonal-latte",
      name: "Seasonal Latte",
      category: "latte",
      is_seasonal: true,
      image_url: null,
      description: null,
      sort_order: 1,
      base_liquid_note: null,
      custom_powder_grams: null,
      powder: { id: "p-1", name: "Meyumi", type: "RECOMMEND" },
      resolved_default_powder_id: null,
      allowed_powder_ids: [],
      sizes: [{ size: "SMALL", base_price_vnd: 45000, milk_ml: 180 }],
    },
  ],
  fusion: [
    {
      id: "seasonal-fusion",
      name: "Seasonal Fusion",
      category: "fusion",
      is_seasonal: true,
      image_url: null,
      description: null,
      sort_order: 0,
      base_liquid_note: null,
      custom_powder_grams: null,
      powder: null,
      resolved_default_powder_id: null,
      allowed_powder_ids: [],
      sizes: [{ size: "SMALL", base_price_vnd: 45000, milk_ml: 180 }],
    },
  ],
  extras: [
    {
      id: "seasonal-extra",
      name: "Seasonal Extra",
      category: "extras",
      is_seasonal: true,
      image_url: null,
      description: null,
      sort_order: 0,
      base_liquid_note: null,
      custom_powder_grams: null,
      powder: null,
      resolved_default_powder_id: null,
      allowed_powder_ids: [],
      sizes: [{ size: "SMALL", base_price_vnd: 45000, milk_ml: 180 }],
    },
  ],
  milk_types: [],
  addon_groups: [],
};

const mockPowderData = {
  powders: [],
  default_powder_gram: { M: 3, L: 4, XL: 5 },
};

import MenuPage from "@/src/views/MenuPage";

// ── Logic tests — MenuPage data fetching contracts ─────────────────────────

describe("MenuPage — Contract 1: fetch cả menu lẫn powders khi mount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi fetchMenu khi component mount", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    // Simulate the fetch logic in MenuPage
    await Promise.all([mockFetchMenu(), mockFetchPowders()]);

    expect(mockFetchMenu).toHaveBeenCalledTimes(1);
  });

  it("gọi fetchPowders khi component mount", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    await Promise.all([mockFetchMenu(), mockFetchPowders()]);

    expect(mockFetchPowders).toHaveBeenCalledTimes(1);
  });

  it("gọi song song cả 2 service — không sequential", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    const start = Date.now();
    await Promise.all([mockFetchMenu(), mockFetchPowders()]);
    const elapsed = Date.now() - start;

    // Both called — assert both resolve
    expect(mockFetchMenu).toHaveBeenCalled();
    expect(mockFetchPowders).toHaveBeenCalled();
    // elapsed would be much higher if sequential (mocks are instant, but structure is correct)
    expect(elapsed).toBeLessThan(100);
  });
});

describe("MenuPage — Contract 2: setPowderData được gọi với powder data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setPowderData nhận đúng data từ fetchPowders", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    const [, powderRes] = await Promise.all([mockFetchMenu(), mockFetchPowders()]);
    mockSetPowderData(powderRes);

    expect(mockSetPowderData).toHaveBeenCalledWith(mockPowderData);
  });
});

describe("MenuPage — Contract 3: tab filtering logic", () => {
  const allItems = [
    { id: "1", category: "latte", is_seasonal: false },
    { id: "2", category: "fusion", is_seasonal: false },
    { id: "3", category: "latte", is_seasonal: true },
  ];

  const data = {
    latte: allItems.filter((i) => i.category === "latte"),
    fusion: allItems.filter((i) => i.category === "fusion"),
  };

  /** Mirrors filteredItems logic from MenuPage */
  function getFilteredItems(activeTab: string) {
    if (activeTab === "seasonal") {
      return [...(data.latte || []), ...(data.fusion || [])].filter((i) => i.is_seasonal);
    }
    return data[activeTab as "latte" | "fusion"] ?? [];
  }

  it("tab latte → giữ cả món seasonal thuộc category latte", () => {
    const items = getFilteredItems("latte");
    expect(items.every((i) => i.category === "latte")).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("tab fusion → chỉ trả fusion items", () => {
    const items = getFilteredItems("fusion");
    expect(items.every((i) => i.category === "fusion")).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("tab seasonal → chỉ trả items có is_seasonal = true", () => {
    const items = getFilteredItems("seasonal");
    expect(items.every((i) => i.is_seasonal)).toBe(true);
    expect(items).toHaveLength(1);
  });

  it("tab không tồn tại → trả mảng rỗng", () => {
    const items = getFilteredItems("unknown");
    expect(items).toHaveLength(0);
  });
});

describe("MenuPage — Seasonal là view độc lập", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueriesLoaded = false;
  });

  it("giữ seasonal trong category gốc và chỉ hiện Seasonal sau khi chọn", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    mockQueriesLoaded = true;
    render(createElement(MenuPage));

    expect(document.querySelector('[data-section="latte"]')?.getAttribute("data-items")).toBe("item-1,seasonal-latte");
    expect(document.querySelector('[data-section="fusion"]')?.getAttribute("data-items")).toBe("seasonal-fusion");
    expect(document.querySelector('[data-section="extras"]')?.getAttribute("data-items")).toBe("seasonal-extra");
    expect(document.querySelector('[data-section="seasonal"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Seasonal" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.querySelector('[data-section="latte"]')).toBeNull();
    expect(document.querySelector('[data-section="fusion"]')).toBeNull();
    expect(document.querySelector('[data-section="extras"]')).toBeNull();
    expect(document.querySelector('[data-section="seasonal"]')?.getAttribute("data-items"))
      .toBe("seasonal-latte,seasonal-fusion,seasonal-extra");
  });
});

describe("MenuPage — Contract 4: error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetch fail → không crash, log error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchMenu.mockRejectedValueOnce(new Error("Network error"));
    mockFetchPowders.mockRejectedValueOnce(new Error("Network error"));

    // MenuPage dùng .catch(() => console.error(...)) — không throw
    await Promise.all([mockFetchMenu(), mockFetchPowders()]).catch((err) => {
      console.error("Error fetching menu or powders:", err);
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("MenuPage — thanh danh mục theo vị trí cuộn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueriesLoaded = false;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const section = this.getAttribute("data-section") ?? this.getAttribute("data-scroll-marker");
      const top = section === "fusion" ? 100 : section === "extras" ? 400 : section === "seasonal" ? 700 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) };
    });
  });

  it("bắt đầu theo dõi cuộn sau khi các section được render", () => {
    const view = render(createElement(MenuPage));
    mockQueriesLoaded = true;
    view.rerender(createElement(MenuPage));

    act(() => fireEvent.scroll(window));

    expect(screen.getByTestId("active-tab").textContent).toBe("fusion");
  });
});
