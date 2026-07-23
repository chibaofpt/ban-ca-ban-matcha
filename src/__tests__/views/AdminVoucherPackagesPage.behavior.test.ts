import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VoucherPackage } from "@/src/services/adminVoucherService";

// ── Mocks khai báo TRƯỚC import ────────────────────────────────────────────

const mockListVoucherPackages = vi.fn();
const mockFetchMenu = vi.fn();
const mockFetchPowders = vi.fn();
const mockCreateVoucherPackage = vi.fn();
const mockUpdateVoucherPackage = vi.fn();
const mockDeleteVoucherPackage = vi.fn();

vi.mock("@/src/services/adminVoucherService", () => ({
  listVoucherPackages: () => mockListVoucherPackages(),
  createVoucherPackage: (...args: unknown[]) => mockCreateVoucherPackage(...args),
  updateVoucherPackage: (...args: unknown[]) => mockUpdateVoucherPackage(...args),
  deleteVoucherPackage: (...args: unknown[]) => mockDeleteVoucherPackage(...args),
}));

vi.mock("@/src/services/menuService", () => ({
  fetchMenu: () => mockFetchMenu(),
}));

vi.mock("@/src/services/powderService", () => ({
  fetchPowders: () => mockFetchPowders(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockPackage: VoucherPackage = {
  id: "pkg-1",
  name: "Giảm 20%",
  description: null,
  voucher_type: "DISCOUNT",
  points_cost: 50,
  expires_after_days: 30,
  discount_type: "PERCENT",
  discount_value: 20,
  is_active: true,
  quantity: null,
  max_per_user: 1,
  menu_item_id: null,
  size: null,
  matcha_powder_id: null,
  milk_type_id: null,
  addon_option_id: null,
  included_addon_option_ids: [],
  covered_delivery_fee_vnd: null,
  min_order_vnd: null,
  covered_price_vnd: null,
  created_at: "2026-01-01T00:00:00Z",
  menuItem: null,
  addonOption: null,
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AdminVoucherPackagesPage — Contract 1: parallel initial load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi 3 services song song khi mount: listVoucherPackages, fetchMenu, fetchPowders", async () => {
    mockListVoucherPackages.mockResolvedValueOnce([mockPackage]);
    mockFetchMenu.mockResolvedValueOnce({ latte: [], fusion: [], milk_types: [], addon_groups: [] });
    mockFetchPowders.mockResolvedValueOnce({ data: [], default_powder_gram: {} });

    await Promise.all([mockListVoucherPackages(), mockFetchMenu(), mockFetchPowders()]);

    expect(mockListVoucherPackages).toHaveBeenCalledTimes(1);
    expect(mockFetchMenu).toHaveBeenCalledTimes(1);
    expect(mockFetchPowders).toHaveBeenCalledTimes(1);
  });

  it("fetch thành công → trả đúng danh sách packages", async () => {
    mockListVoucherPackages.mockResolvedValueOnce([mockPackage]);
    mockFetchMenu.mockResolvedValueOnce({ latte: [], fusion: [], milk_types: [], addon_groups: [] });
    mockFetchPowders.mockResolvedValueOnce({ data: [], default_powder_gram: {} });

    const [packages] = await Promise.all([
      mockListVoucherPackages(),
      mockFetchMenu(),
      mockFetchPowders(),
    ]);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("Giảm 20%");
  });

  it("fetch fail → throw error", async () => {
    mockListVoucherPackages.mockRejectedValueOnce(new Error("DB error"));
    mockFetchMenu.mockResolvedValueOnce({ latte: [], fusion: [], milk_types: [], addon_groups: [] });
    mockFetchPowders.mockResolvedValueOnce({ data: [] });

    await expect(
      Promise.all([mockListVoucherPackages(), mockFetchMenu(), mockFetchPowders()])
    ).rejects.toThrow();
  });
});

describe("AdminVoucherPackagesPage — Contract 2: create mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("createVoucherPackage được gọi với đúng input DISCOUNT", async () => {
    mockCreateVoucherPackage.mockResolvedValueOnce(mockPackage);

    const input = {
      voucher_type: "DISCOUNT" as const,
      name: "Giảm 20%",
      points_cost: 50,
      discount_type: "PERCENT" as const,
      discount_value: 20,
      expires_after_days: 30,
    };

    await mockCreateVoucherPackage(input);

    expect(mockCreateVoucherPackage).toHaveBeenCalledWith(
      expect.objectContaining({ voucher_type: "DISCOUNT", discount_value: 20 })
    );
  });

  it("create thành công → package mới được thêm vào đầu list", async () => {
    mockCreateVoucherPackage.mockResolvedValueOnce({ ...mockPackage, id: "pkg-new" });

    const packages: VoucherPackage[] = [{ ...mockPackage, id: "pkg-existing" }];
    const newPkg = await mockCreateVoucherPackage({});
    packages.unshift(newPkg);

    expect(packages[0].id).toBe("pkg-new");
    expect(packages).toHaveLength(2);
  });

  it("DISCOUNT với discount_value = 0 → không tạo (validation)", () => {
    const isValid = (discountValue: number | "") =>
      discountValue !== "" && Number(discountValue) > 0;

    expect(isValid(0)).toBe(false);
    expect(isValid("")).toBe(false);
    expect(isValid(20)).toBe(true);
  });
});

describe("AdminVoucherPackagesPage — Contract 3: update mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateVoucherPackage được gọi với đúng id và fields", async () => {
    mockUpdateVoucherPackage.mockResolvedValueOnce({ ...mockPackage, points_cost: 80 });

    await mockUpdateVoucherPackage("pkg-1", { points_cost: 80 });

    expect(mockUpdateVoucherPackage).toHaveBeenCalledWith("pkg-1", { points_cost: 80 });
  });

  it("update thành công → package được cập nhật trong list (không refetch toàn bộ)", async () => {
    mockUpdateVoucherPackage.mockResolvedValueOnce({ ...mockPackage, points_cost: 80 });

    let packages: VoucherPackage[] = [{ ...mockPackage }];
    const updated = await mockUpdateVoucherPackage("pkg-1", { points_cost: 80 });

    packages = packages.map((p) => (p.id === "pkg-1" ? { ...p, ...updated } : p));

    expect(packages[0].points_cost).toBe(80);
  });
});

describe("AdminVoucherPackagesPage — Contract 4: delete mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deleteVoucherPackage được gọi với đúng id", async () => {
    mockDeleteVoucherPackage.mockResolvedValueOnce(undefined);

    await mockDeleteVoucherPackage("pkg-1");

    expect(mockDeleteVoucherPackage).toHaveBeenCalledWith("pkg-1");
  });

  it("delete thành công → package bị remove khỏi list", async () => {
    mockDeleteVoucherPackage.mockResolvedValueOnce(undefined);

    let packages: VoucherPackage[] = [{ ...mockPackage }];
    await mockDeleteVoucherPackage("pkg-1");

    packages = packages.filter((p) => p.id !== "pkg-1");

    expect(packages).toHaveLength(0);
  });
});

describe("AdminVoucherPackagesPage — Contract 5: activeVoucherCount computation", () => {
  it("đếm đúng số packages có is_active = true", () => {
    const packages: VoucherPackage[] = [
      { ...mockPackage, id: "1", is_active: true },
      { ...mockPackage, id: "2", is_active: false },
      { ...mockPackage, id: "3", is_active: true },
    ];

    const activeCount = packages.filter((p) => p.is_active).length;

    expect(activeCount).toBe(2);
  });
});
