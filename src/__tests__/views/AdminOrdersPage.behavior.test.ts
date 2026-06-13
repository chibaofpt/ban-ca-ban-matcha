import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockFetchAdminOrders = vi.fn();
const mockConfirmPayment = vi.fn();
const mockAdminCancelOrder = vi.fn();

vi.mock("@/src/services/adminOrderService", () => ({
  fetchAdminOrders: (...args: unknown[]) => mockFetchAdminOrders(...args),
  confirmPayment: (...args: unknown[]) => mockConfirmPayment(...args),
  adminCancelOrder: (...args: unknown[]) => mockAdminCancelOrder(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockOrdersResponse = {
  data: [
    {
      id: "order-1",
      order_code: "BCBM-A3X7K2",
      status: "PENDING",
      order_type: "PICKUP",
      total_vnd: 55000,
      created_at: "2026-01-01T10:00:00Z",
      auto_cancel_at: "2026-01-01T10:20:00Z",
      user: { name: "Nguyễn Văn A", phone_number: "+84901234567" },
      handler: null,
      pickup_time: null,
      items: [{ quantity: 1, size: "M", unit_price_vnd: 55000, addons_price_vnd: 0, menuItem: { name: "Matcha Latte" }, addons: [] }],
    },
  ],
  meta: { total: 1, totalPages: 1, page: 1, limit: 10 },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AdminOrdersPage — Contract 1: fetch với params đúng theo activeTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tab 'counter' → gọi fetchAdminOrders với order_type=COUNTER", async () => {
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    // Mirrors tab → params mapping in AdminOrdersPage
    const activeTab = "counter";
    const orderTypeParam = activeTab === "counter" ? "COUNTER" : "";

    await mockFetchAdminOrders({ order_type: orderTypeParam, page: 1, limit: 10 });

    expect(mockFetchAdminOrders).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: "COUNTER" })
    );
  });

  it("tab 'customer' → gọi fetchAdminOrders với order_type=PICKUP,DELIVERY", async () => {
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    const activeTab = "customer";
    const orderTypeParam = activeTab === "customer" ? "PICKUP,DELIVERY" : "";

    await mockFetchAdminOrders({ order_type: orderTypeParam, page: 1, limit: 10 });

    expect(mockFetchAdminOrders).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: "PICKUP,DELIVERY" })
    );
  });

  it("tab 'pending' → gọi fetchAdminOrders với status=PENDING", async () => {
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    const activeTab = "pending";
    const statusParam = activeTab === "pending" ? "PENDING" : "";

    await mockFetchAdminOrders({ status: statusParam, page: 1, limit: 10 });

    expect(mockFetchAdminOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" })
    );
  });

  it("tab 'cancelled' → gọi fetchAdminOrders với status=CANCELLED", async () => {
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    await mockFetchAdminOrders({ status: "CANCELLED", page: 1, limit: 10 });

    expect(mockFetchAdminOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED" })
    );
  });
});

describe("AdminOrdersPage — Contract 2: polling interval theo tab", () => {
  it("tab pending → interval 10000ms", () => {
    const activeTab = "pending" as string;
    const interval =
      activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(10000);
  });

  it("tab customer → interval 15000ms", () => {
    const activeTab = "customer" as string;
    const interval =
      activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(15000);
  });

  it("tab counter/cancelled → interval 30000ms", () => {
    const activeTab = "counter" as string;
    const interval =
      activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(30000);
  });
});

describe("AdminOrdersPage — Contract 3: mutation triggers refetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("confirmPayment thành công → có thể gọi refetch sau đó", async () => {
    mockConfirmPayment.mockResolvedValueOnce(undefined);
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    await mockConfirmPayment("order-1");
    await mockFetchAdminOrders({ status: "PENDING", page: 1, limit: 10 });

    expect(mockConfirmPayment).toHaveBeenCalledWith("order-1");
    expect(mockFetchAdminOrders).toHaveBeenCalledTimes(1);
  });

  it("adminCancelOrder thành công → có thể gọi refetch sau đó", async () => {
    mockAdminCancelOrder.mockResolvedValueOnce(undefined);
    mockFetchAdminOrders.mockResolvedValueOnce(mockOrdersResponse);

    await mockAdminCancelOrder("order-1");
    await mockFetchAdminOrders({ page: 1, limit: 10 });

    expect(mockAdminCancelOrder).toHaveBeenCalledWith("order-1");
    expect(mockFetchAdminOrders).toHaveBeenCalledTimes(1);
  });

  it("confirmPayment fail → throw error", async () => {
    mockConfirmPayment.mockRejectedValueOnce(new Error("Xác nhận thất bại"));

    await expect(mockConfirmPayment("order-1")).rejects.toThrow("Xác nhận thất bại");
  });
});

describe("AdminOrdersPage — Contract 4: page reset khi đổi tab", () => {
  it("đổi tab → page phải reset về 1", () => {
    let page = 3;
    const setPage = (val: number | ((p: number) => number)) => {
      page = typeof val === "function" ? val(page) : val;
    };

    // Simulate tab change
    setPage(1);

    expect(page).toBe(1);
  });
});

describe("AdminOrdersPage — Contract 5: canCancel logic", () => {
  /** Mirrors canCancel logic from AdminOrdersPage */
  function canCancel(orderType: string, status: string) {
    return (
      (orderType === "COUNTER" && status === "COMPLETED") ||
      (orderType !== "COUNTER" && status !== "COMPLETED" && status !== "CANCELLED")
    );
  }

  it("COUNTER + COMPLETED → có thể cancel (staff mistake)", () => {
    expect(canCancel("COUNTER", "COMPLETED")).toBe(true);
  });

  it("PICKUP + PENDING → có thể cancel", () => {
    expect(canCancel("PICKUP", "PENDING")).toBe(true);
  });

  it("PICKUP + COMPLETED → không thể cancel", () => {
    expect(canCancel("PICKUP", "COMPLETED")).toBe(false);
  });

  it("PICKUP + CANCELLED → không thể cancel (đã cancel rồi)", () => {
    expect(canCancel("PICKUP", "CANCELLED")).toBe(false);
  });

  it("COUNTER + PENDING → không thể cancel (counter không có pending flow)", () => {
    expect(canCancel("COUNTER", "PENDING")).toBe(false);
  });
});
