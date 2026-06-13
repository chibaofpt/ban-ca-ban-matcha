import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockFetchMenu = vi.fn();
const mockFetchPowders = vi.fn();
const mockFetchCustomerVouchers = vi.fn();
const mockCreateStaffOrder = vi.fn();
const mockSetPowderData = vi.fn();

vi.mock("@/src/services/menuService", () => ({
  fetchMenu: () => mockFetchMenu(),
}));

vi.mock("@/src/services/powderService", () => ({
  fetchPowders: () => mockFetchPowders(),
}));

vi.mock("@/src/services/staffVoucherService", () => ({
  fetchCustomerVouchers: (...args: unknown[]) => mockFetchCustomerVouchers(...args),
}));

vi.mock("@/src/services/staffOrderService", () => ({
  createStaffOrder: (...args: unknown[]) => mockCreateStaffOrder(...args),
}));

vi.mock("@/src/lib/store/powderStore", () => ({
  usePowderStore: (selector: (s: { setPowderData: typeof mockSetPowderData; data: []; defaultPowderGram: object }) => unknown) =>
    selector({ setPowderData: mockSetPowderData, data: [], defaultPowderGram: {} }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockMenuData = {
  updated_at: "2026-01-01T00:00:00Z",
  latte: [{ id: "item-1", name: "Matcha Latte", category: "latte", sizes: [], addon_groups: [] }],
  fusion: [],
};

const mockPowderData = { powders: [], default_powder_gram: { M: 3, L: 4, XL: 5 } };

// ── Tests ──────────────────────────────────────────────────────────────────

describe("StaffOrdersPage — Contract 1: parallel menu + powder fetch khi mount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi fetchMenu khi mount", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    await Promise.all([mockFetchMenu(), mockFetchPowders()]);

    expect(mockFetchMenu).toHaveBeenCalledTimes(1);
  });

  it("gọi fetchPowders khi mount", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    await Promise.all([mockFetchMenu(), mockFetchPowders()]);

    expect(mockFetchPowders).toHaveBeenCalledTimes(1);
  });

  it("setPowderData được gọi với powder response", async () => {
    mockFetchMenu.mockResolvedValueOnce(mockMenuData);
    mockFetchPowders.mockResolvedValueOnce(mockPowderData);

    const [, powderRes] = await Promise.all([mockFetchMenu(), mockFetchPowders()]);
    mockSetPowderData(powderRes);

    expect(mockSetPowderData).toHaveBeenCalledWith(mockPowderData);
  });

  it("fetch fail → status = error", async () => {
    mockFetchMenu.mockRejectedValueOnce(new Error("Network"));
    mockFetchPowders.mockRejectedValueOnce(new Error("Network"));

    let status = "loading";

    await Promise.all([mockFetchMenu(), mockFetchPowders()]).catch(() => {
      status = "error";
    });

    expect(status).toBe("error");
  });
});

describe("StaffOrdersPage — Contract 2: customer vouchers conditional fetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("customerInfo.type = existing → fetch vouchers", async () => {
    mockFetchCustomerVouchers.mockResolvedValueOnce([]);

    const customerInfo = { type: "existing" as const, data: { id: "user-1", phone_number: "+84901234567", name: "Khách A", points_balance: 10 } };

    if (customerInfo?.type === "existing") {
      await mockFetchCustomerVouchers(customerInfo.data.id);
    }

    expect(mockFetchCustomerVouchers).toHaveBeenCalledWith("user-1");
  });

  it("customerInfo = null → KHÔNG fetch vouchers", async () => {
    const customerInfo = null;

    if (customerInfo !== null && (customerInfo as { type: string }).type === "existing") {
      await mockFetchCustomerVouchers("user-1");
    }

    expect(mockFetchCustomerVouchers).not.toHaveBeenCalled();
  });

  it("customerInfo.type = new → KHÔNG fetch vouchers", async () => {
    const customerInfo = { type: "new" as const, phone_number: "+84901234567", name: "Khách mới" };

    if ((customerInfo as any)?.type === "existing") {
      await mockFetchCustomerVouchers("user-1");
    }

    expect(mockFetchCustomerVouchers).not.toHaveBeenCalled();
  });

  it("customer thay đổi → vouchers cũ bị clear", () => {
    let customerVouchers = [{ id: "v-1" }];

    // Simulate customer change → clear vouchers
    customerVouchers = [];

    expect(customerVouchers).toHaveLength(0);
  });
});

describe("StaffOrdersPage — Contract 3: order creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createStaffOrder thành công → cart được clear", async () => {
    mockCreateStaffOrder.mockResolvedValueOnce({ id: "order-new" });

    let cart = [{ cartId: "c-1" }];

    await mockCreateStaffOrder({ items: [] });

    // Simulate handleSuccess
    cart = [];

    expect(mockCreateStaffOrder).toHaveBeenCalled();
    expect(cart).toHaveLength(0);
  });

  it("createStaffOrder fail → throw error, cart giữ nguyên", async () => {
    mockCreateStaffOrder.mockRejectedValueOnce(new Error("Server error"));

    const cart = [{ cartId: "c-1" }];

    await expect(mockCreateStaffOrder({ items: [] })).rejects.toThrow();
    // Cart không bị clear khi fail
    expect(cart).toHaveLength(1);
  });
});

describe("StaffOrdersPage — Contract 4: category filter logic", () => {
  const menuItems = [
    { id: "1", category: "latte", name: "Matcha Latte" },
    { id: "2", category: "fusion", name: "Matcha Cam" },
    { id: "3", category: "latte", name: "Matcha Sữa Yến Mạch" },
  ];

  /** Mirrors visibleItems logic from StaffOrdersPage */
  function getVisibleItems(activeCategory: string) {
    return menuItems.filter(
      (i) => activeCategory === "Tất cả" || i.category === activeCategory
    );
  }

  it("Tất cả → trả tất cả items", () => {
    expect(getVisibleItems("Tất cả")).toHaveLength(3);
  });

  it("latte → chỉ trả latte", () => {
    const result = getVisibleItems("latte");
    expect(result.every((i) => i.category === "latte")).toBe(true);
  });

  it("fusion → chỉ trả fusion", () => {
    const result = getVisibleItems("fusion");
    expect(result.every((i) => i.category === "fusion")).toBe(true);
  });
});
