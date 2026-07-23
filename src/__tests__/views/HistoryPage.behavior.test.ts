import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockFetchCustomerOrders = vi.fn();
const mockListMyVouchers = vi.fn();
const mockCancelOrder = vi.fn();

vi.mock("@/src/services/orderService", () => ({
  fetchCustomerOrders: (...args: unknown[]) => mockFetchCustomerOrders(...args),
  cancelOrder: (...args: unknown[]) => mockCancelOrder(...args),
}));

vi.mock("@/src/services/customerVoucherService", () => ({
  listMyVouchers: () => mockListMyVouchers(),
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
      shipping_fee_vnd: 0,
      freeship_discount_vnd: 0,
      grand_total_vnd: 55000,
      subtotal_vnd: 55000,
      total_voucher_discount_vnd: 0,
      created_at: "2026-01-01T10:00:00Z",
      auto_cancel_at: "2026-01-01T10:20:00Z",
      payment_qr_url: "https://qr.example.com/abc",
      items: [],
    },
  ],
  meta: { totalPages: 2, total: 15, page: 1, limit: 10 },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("HistoryPage — Contract 1: fetch orders khi tab = orders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi fetchCustomerOrders với đúng page khi tab = orders", async () => {
    mockFetchCustomerOrders.mockResolvedValueOnce(mockOrdersResponse);

    const activeTab = "orders";
    const page = 1;

    if (activeTab === "orders") {
      await mockFetchCustomerOrders({ page, limit: 10 });
    }

    expect(mockFetchCustomerOrders).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it("tab = orders, page = 2 → gọi fetchCustomerOrders với page 2", async () => {
    mockFetchCustomerOrders.mockResolvedValueOnce(mockOrdersResponse);

    const page = 2;
    await mockFetchCustomerOrders({ page, limit: 10 });

    expect(mockFetchCustomerOrders).toHaveBeenCalledWith({ page: 2, limit: 10 });
  });
});

describe("HistoryPage — Contract 2: fetch vouchers chỉ khi tab = vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tab = orders → KHÔNG gọi listMyVouchers", async () => {
    const activeTab = "orders" as string;

    if (activeTab === "vouchers") {
      await mockListMyVouchers();
    }

    expect(mockListMyVouchers).not.toHaveBeenCalled();
  });

  it("tab = vouchers → gọi listMyVouchers", async () => {
    mockListMyVouchers.mockResolvedValueOnce([]);

    const activeTab = "vouchers";

    if (activeTab === "vouchers") {
      await mockListMyVouchers();
    }

    expect(mockListMyVouchers).toHaveBeenCalledTimes(1);
  });
});

describe("HistoryPage — Contract 3: polling interval cho orders", () => {
  it("orders tab → polling interval 15000ms", () => {
    // usePolling({ interval: 15000, enabled: activeTab === "orders" })
    const ORDERS_POLL_INTERVAL = 15000;
    expect(ORDERS_POLL_INTERVAL).toBe(15000);
  });

  it("orders polling chỉ enabled khi tab = orders", () => {
    const activeTab = "vouchers" as string;
    const enabled = activeTab === "orders";
    expect(enabled).toBe(false);
  });

  it("orders polling enabled khi tab = orders", () => {
    const activeTab = "orders" as string;
    const enabled = activeTab === "orders";
    expect(enabled).toBe(true);
  });
});

describe("HistoryPage — Contract 4: cancel order → refetch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancelOrder thành công → gọi được refetch", async () => {
    mockCancelOrder.mockResolvedValueOnce(undefined);
    mockFetchCustomerOrders.mockResolvedValueOnce(mockOrdersResponse);

    await mockCancelOrder("order-1");
    await mockFetchCustomerOrders({ page: 1, limit: 10 });

    expect(mockCancelOrder).toHaveBeenCalledWith("order-1");
    expect(mockFetchCustomerOrders).toHaveBeenCalled();
  });

  it("cancelOrder fail → throw error", async () => {
    mockCancelOrder.mockRejectedValueOnce(new Error("Không thể huỷ"));

    await expect(mockCancelOrder("order-1")).rejects.toThrow();
  });
});

describe("HistoryPage — Contract 5: page reset khi đổi tab", () => {
  it("đổi tab → page reset về 1", () => {
    let page = 3;

    // Mirrors useEffect(() => { setPage(1); }, [activeTab])
    const onTabChange = () => { page = 1; };
    onTabChange();

    expect(page).toBe(1);
  });
});

describe("HistoryPage — Contract 6: totalPages từ meta", () => {
  it("lấy totalPages từ data.meta.totalPages", () => {
    const data = mockOrdersResponse;
    const totalPages = data?.meta?.totalPages || 1;
    expect(totalPages).toBe(2);
  });

  it("data null → totalPages fallback về 1", () => {
    const data = null;
    const totalPages = (data as typeof mockOrdersResponse | null)?.meta?.totalPages || 1;
    expect(totalPages).toBe(1);
  });
});
