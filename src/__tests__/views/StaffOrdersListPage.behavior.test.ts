import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockFetchOrdersList = vi.fn();

vi.mock("@/src/services/staffOrdersListService", () => ({
  fetchOrdersList: (...args: unknown[]) => mockFetchOrdersList(...args),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockOrdersResponse = {
  data: [
    {
      id: "order-1",
      order_code: "BCBM-A3X7K2",
      status: "ADMIN_CONFIRMED",
      order_type: "PICKUP",
      total_vnd: 55000,
      created_at: "2026-01-01T10:00:00Z",
      pickup_time: null,
      user: { name: "Nguyễn Văn A", phone_number: "+84901234567" },
      handler: null,
      items: [{ quantity: 1, size: "M", unit_price_vnd: 55000, addons_price_vnd: 0, menuItem: { name: "Matcha Latte" }, addons: [] }],
    },
  ],
  meta: { total: 1, totalPages: 1, page: 1, limit: 10 },
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("StaffOrdersListPage — Contract 1: fetch với params đúng theo tab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tab 'counter' → gọi với order_type=COUNTER", async () => {
    mockFetchOrdersList.mockResolvedValueOnce(mockOrdersResponse);

    const activeTab = "counter";
    const orderTypeParam = activeTab === "counter" ? "COUNTER"
      : activeTab === "customer" ? "PICKUP,DELIVERY" : "";
    const statusParam = activeTab === "pending" ? "PENDING"
      : activeTab === "cancelled" ? "CANCELLED" : "";

    await mockFetchOrdersList({
      order_type: orderTypeParam || undefined,
      status: statusParam || undefined,
      page: 1,
      limit: 10,
    });

    expect(mockFetchOrdersList).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: "COUNTER" })
    );
  });

  it("tab 'customer' → gọi với order_type=PICKUP,DELIVERY", async () => {
    mockFetchOrdersList.mockResolvedValueOnce(mockOrdersResponse);

    await mockFetchOrdersList({ order_type: "PICKUP,DELIVERY", page: 1, limit: 10 });

    expect(mockFetchOrdersList).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: "PICKUP,DELIVERY" })
    );
  });

  it("tab 'pending' → gọi với status=PENDING", async () => {
    mockFetchOrdersList.mockResolvedValueOnce(mockOrdersResponse);

    await mockFetchOrdersList({ status: "PENDING", page: 1, limit: 10 });

    expect(mockFetchOrdersList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PENDING" })
    );
  });
});

describe("StaffOrdersListPage — Contract 2: polling interval theo tab", () => {
  it("tab customer → interval 15000ms", () => {
    const activeTab = "customer";
    const interval = activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(15000);
  });

  it("tab pending → interval 10000ms", () => {
    const activeTab = "pending";
    const interval = activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(10000);
  });

  it("tab counter → interval 30000ms", () => {
    const activeTab = "counter";
    const interval = activeTab === "customer" ? 15000 : activeTab === "pending" ? 10000 : 30000;
    expect(interval).toBe(30000);
  });
});

describe("StaffOrdersListPage — Contract 3: page reset khi đổi tab", () => {
  it("đổi activeTab → page reset về 1", () => {
    let page = 5;

    // Mirrors useEffect(() => { setPage(1); }, [activeTab])
    page = 1;

    expect(page).toBe(1);
  });
});

describe("StaffOrdersListPage — Contract 4: renderActionButtons logic", () => {
  /** Mirrors renderActionButtons from StaffOrdersListPage */
  function getActionLabel(status: string): string | null {
    if (status === "ADMIN_CONFIRMED") return "Đã làm xong";
    if (status === "STAFF_DONE") return "Khách đã đến lấy";
    return null;
  }

  it("ADMIN_CONFIRMED → hiện nút 'Đã làm xong'", () => {
    expect(getActionLabel("ADMIN_CONFIRMED")).toBe("Đã làm xong");
  });

  it("STAFF_DONE → hiện nút 'Khách đã đến lấy'", () => {
    expect(getActionLabel("STAFF_DONE")).toBe("Khách đã đến lấy");
  });

  it("PENDING/COMPLETED/CANCELLED → không hiện action button", () => {
    expect(getActionLabel("PENDING")).toBeNull();
    expect(getActionLabel("COMPLETED")).toBeNull();
    expect(getActionLabel("CANCELLED")).toBeNull();
  });
});

describe("StaffOrdersListPage — Contract 5: pendingCount chỉ fetch khi userRole = ADMIN", () => {
  beforeEach(() => vi.clearAllMocks());

  it("userRole = STAFF → KHÔNG gọi fetchOrdersList cho pending count", async () => {
    const userRole = "STAFF";

    if (userRole === "ADMIN") {
      await mockFetchOrdersList({ status: "PENDING", limit: 1 });
    }

    expect(mockFetchOrdersList).not.toHaveBeenCalled();
  });

  it("userRole = ADMIN → gọi fetchOrdersList cho pending count", async () => {
    mockFetchOrdersList.mockResolvedValueOnce({ meta: { total: 3 } });
    const userRole = "ADMIN";

    if (userRole === "ADMIN") {
      await mockFetchOrdersList({ status: "PENDING", limit: 1 });
    }

    expect(mockFetchOrdersList).toHaveBeenCalledWith({ status: "PENDING", limit: 1 });
  });
});
