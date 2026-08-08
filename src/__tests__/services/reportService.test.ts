import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "@/src/lib/api/client";
import { getReport, getStaffList } from "@/src/services/reportService";
// getStaffReport and getAdminReport will be available once implemented
import type { DailyReport, StaffMember } from "@/src/lib/types/report";
// AdminReport will be imported once type is implemented
// import type { AdminReport } from "@/src/lib/types/report";

// ---------------------------------------------------------------------------
// Mock apiClient
// ---------------------------------------------------------------------------

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockReport: DailyReport = {
  summary: {
    total_orders: 10,
    total_cups: 25,
    total_revenue_vnd: 1_250_000,
  },
  powder_usage: [
    { powder_name: "Meyumi", total_grams: 87.5 },
    { powder_name: "Hana", total_grams: 45.0 },
  ],
  milk_usage: [
    { milk_name: "Sữa bò", total_ml: 2600 },
    { milk_name: "Sữa yến mạch", total_ml: 400 },
  ],
  latte_sales: [
    {
      name: "Premium Matcha Latte",
      sizes: { M: 5, L: 3, XL: 1 },
      total_cups: 9,
    },
  ],
  fusion_sales: [
    {
      name: "Matcha Kem Dừa",
      sizes: { M: 8, L: 4, XL: 2 },
      total_cups: 14,
    },
  ],
};

const mockStaff: StaffMember[] = [
  { id: "staff-id-1", name: "Nguyễn Văn A", role: "STAFF" },
  { id: "admin-id-1", name: "Trần Thị B", role: "ADMIN" },
];

// ---------------------------------------------------------------------------
// getReport
// ---------------------------------------------------------------------------

describe("getReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /api/report with startDate and endDate", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    await getReport({ startDate: "2026-05-01", endDate: "2026-05-31" });

    expect(apiClient.get).toHaveBeenCalledOnce();
    const [url, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(url).toBe("/api/report");
    expect(config?.params).toMatchObject({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
  });

  it("includes staffId param when provided", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    await getReport({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      staffId: "staff-id-1",
    });

    const [, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(config?.params).toMatchObject({ staffId: "staff-id-1" });
  });

  it("omits staffId param when not provided", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    await getReport({ startDate: "2026-05-01", endDate: "2026-05-31" });

    const [, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(config?.params).not.toHaveProperty("staffId");
  });

  it("returns the DailyReport data from the response", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    const result = await getReport({ startDate: "2026-05-01", endDate: "2026-05-31" });

    expect(result).toEqual(mockReport);
  });

  it("returns correct summary fields", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    const result = await getReport({ startDate: "2026-05-31", endDate: "2026-05-31" });

    expect(result.summary.total_orders).toBe(10);
    expect(result.summary.total_cups).toBe(25);
    expect(result.summary.total_revenue_vnd).toBe(1_250_000);
  });

  it("returns powder_usage array", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    const result = await getReport({ startDate: "2026-05-31", endDate: "2026-05-31" });

    expect(result.powder_usage).toHaveLength(2);
    expect(result.powder_usage[0].powder_name).toBe("Meyumi");
    expect(result.powder_usage[0].total_grams).toBe(87.5);
  });

  it("returns milk_usage array", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    const result = await getReport({ startDate: "2026-05-31", endDate: "2026-05-31" });

    expect(result.milk_usage).toHaveLength(2);
    expect(result.milk_usage[0].milk_name).toBe("Sữa bò");
    expect(result.milk_usage[0].total_ml).toBe(2600);
  });

  it("returns latte_sales and fusion_sales arrays", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockReport } });

    const result = await getReport({ startDate: "2026-05-31", endDate: "2026-05-31" });

    expect(result.latte_sales).toHaveLength(1);
    expect(result.latte_sales[0].name).toBe("Premium Matcha Latte");
    expect(result.latte_sales[0].sizes).toEqual({ M: 5, L: 3, XL: 1 });
    expect(result.latte_sales[0].total_cups).toBe(9);

    expect(result.fusion_sales).toHaveLength(1);
    expect(result.fusion_sales[0].name).toBe("Matcha Kem Dừa");
    expect(result.fusion_sales[0].sizes).toEqual({ M: 8, L: 4, XL: 2 });
  });

  it("propagates API errors", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Network error"));

    await expect(
      getReport({ startDate: "2026-05-31", endDate: "2026-05-31" })
    ).rejects.toThrow("Network error");
  });
});

// ---------------------------------------------------------------------------
// getStaffList
// ---------------------------------------------------------------------------

describe("getStaffList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /api/admin/staff", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockStaff } });

    await getStaffList();

    expect(apiClient.get).toHaveBeenCalledOnce();
    const [url] = vi.mocked(apiClient.get).mock.calls[0];
    expect(url).toBe("/api/admin/staff");
  });

  it("returns the StaffMember array from the response", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockStaff } });

    const result = await getStaffList();

    expect(result).toEqual(mockStaff);
    expect(result).toHaveLength(2);
  });

  it("returns staff members with correct shape", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockStaff } });

    const result = await getStaffList();

    expect(result[0]).toMatchObject({ id: "staff-id-1", name: "Nguyễn Văn A", role: "STAFF" });
    expect(result[1]).toMatchObject({ id: "admin-id-1", name: "Trần Thị B", role: "ADMIN" });
  });

  it("returns empty array when no staff exist", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: [] } });

    const result = await getStaffList();

    expect(result).toEqual([]);
  });

  it("propagates API errors", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Forbidden"));

    await expect(getStaffList()).rejects.toThrow("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// getStaffReport
// ---------------------------------------------------------------------------

describe("getStaffReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi GET /api/report với startDate và endDate", async () => {
    const { getStaffReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { summary: { total_orders: 5, total_revenue_vnd: 350_000 } } },
    });

    await getStaffReport({ startDate: "2026-06-01", endDate: "2026-06-20" });

    expect(apiClient.get).toHaveBeenCalledOnce();
    const [url, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(url).toBe("/api/report");
    expect(config?.params).toMatchObject({ startDate: "2026-06-01", endDate: "2026-06-20" });
  });

  it("trả về chỉ summary (total_orders + total_revenue_vnd)", async () => {
    const { getStaffReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: { summary: { total_orders: 5, total_revenue_vnd: 350_000 } } },
    });

    const result = await getStaffReport({ startDate: "2026-06-01", endDate: "2026-06-20" });

    expect(result.summary.total_orders).toBe(5);
    expect(result.summary.total_revenue_vnd).toBe(350_000);
    // No total_cups in staff summary
    expect((result.summary as Record<string, unknown>).total_cups).toBeUndefined();
  });

  it("propagates API errors", async () => {
    const { getStaffReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      getStaffReport({ startDate: "2026-06-01", endDate: "2026-06-20" })
    ).rejects.toThrow("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// getAdminReport
// ---------------------------------------------------------------------------

describe("getAdminReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gọi GET /api/admin/report với đầy đủ params", async () => {
    const { getAdminReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          summary: { total_orders: 10, total_cups: 20, total_revenue_vnd: 500_000 },
          powder_usage: [],
          milk_usage: [],
          latte_sales: [],
          fusion_sales: [],
          addon_usage: [],
          revenue_by_type: [],
          top_products: [],
        },
      },
    });

    await getAdminReport({ startDate: "2026-06-01", endDate: "2026-06-20" });

    expect(apiClient.get).toHaveBeenCalledOnce();
    const [url, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(url).toBe("/api/admin/report");
    expect(config?.params).toMatchObject({ startDate: "2026-06-01", endDate: "2026-06-20" });
  });

  it("bao gồm staffId khi được cung cấp", async () => {
    const { getAdminReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          summary: { total_orders: 0, total_cups: 0, total_revenue_vnd: 0 },
          powder_usage: [],
          milk_usage: [],
          latte_sales: [],
          fusion_sales: [],
          addon_usage: [],
          revenue_by_type: [],
          top_products: [],
        },
      },
    });

    await getAdminReport({ startDate: "2026-06-01", endDate: "2026-06-20", staffId: "staff-id-1" });

    const [, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(config?.params).toMatchObject({ staffId: "staff-id-1" });
  });

  it("không bỏ staffId khi không được cung cấp", async () => {
    const { getAdminReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          summary: { total_orders: 0, total_cups: 0, total_revenue_vnd: 0 },
          powder_usage: [],
          milk_usage: [],
          latte_sales: [],
          fusion_sales: [],
          addon_usage: [],
          revenue_by_type: [],
          top_products: [],
        },
      },
    });

    await getAdminReport({ startDate: "2026-06-01", endDate: "2026-06-20" });

    const [, config] = vi.mocked(apiClient.get).mock.calls[0];
    expect(config?.params).not.toHaveProperty("staffId");
  });

  it("trả về AdminReport với addon_usage, revenue_by_type, top_products", async () => {
    const { getAdminReport } = await import("@/src/services/reportService");

    const mockAdminReport = {
      summary: { total_orders: 5, total_cups: 12, total_revenue_vnd: 350_000 },
      powder_usage: [{ powder_name: "Meyumi", total_grams: 40 }],
      milk_usage: [{ milk_name: "Sữa bò", total_ml: 2400 }],
      latte_sales: [{ name: "Latte Test", sizes: { M: 5, L: 3, XL: 1 }, total_cups: 9 }],
      fusion_sales: [],
      addon_usage: [{ addon_label: "Nửa viên kem", group_name: "Kem", total_count: 3 }],
      revenue_by_type: [{ order_type: "COUNTER", total_revenue_vnd: 350_000, order_count: 5 }],
      top_products: [{ name: "Latte Test", category: "latte", total_cups: 9 }],
    };

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { data: mockAdminReport } });

    const result = await getAdminReport({ startDate: "2026-06-01", endDate: "2026-06-20" });

    expect(result).toEqual(mockAdminReport);
    expect(result.addon_usage).toHaveLength(1);
    expect(result.revenue_by_type).toHaveLength(1);
    expect(result.top_products).toHaveLength(1);
  });

  it("propagates API errors", async () => {
    const { getAdminReport } = await import("@/src/services/reportService");

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      getAdminReport({ startDate: "2026-06-01", endDate: "2026-06-20" })
    ).rejects.toThrow("Forbidden");
  });
});
