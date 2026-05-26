/**
 * Tests for customer-facing voucher service.
 *
 * Covers:
 *  - listVoucherPackages   → GET /api/admin/voucher-packages (public active list)
 *  - listMyVouchers        → GET /api/profile/vouchers
 *  - exchangeVoucher       → POST /api/profile/vouchers/exchange
 *
 * All API calls are mocked via vi.mock — no network required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from "@/src/lib/api/client";
import {
  listActiveVoucherPackages,
  listMyVouchers,
  exchangeVoucher,
} from "@/src/services/customerVoucherService";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockDiscountPackage = {
  id: "pkg-discount-1",
  name: "Giảm 10%",
  description: "Áp dụng cho toàn đơn",
  voucher_type: "DISCOUNT" as const,
  points_cost: 50,
  discount_type: "PERCENT" as const,
  discount_value: 10,
  menu_item_id: null,
  size: null,
  addon_option_id: null,
  covered_price_vnd: null,
  is_active: true,
  expires_after_days: 30,
  quantity: 100,
  max_per_user: 1,
  created_at: "2026-01-01T00:00:00Z",
};

const mockProductPackage = {
  id: "pkg-product-1",
  name: "1 ly Meyumi miễn phí",
  description: null,
  voucher_type: "PRODUCT" as const,
  points_cost: 100,
  discount_type: null,
  discount_value: null,
  menu_item_id: "item-meyumi",
  size: "M" as const,
  addon_option_id: null,
  covered_price_vnd: 50000,
  is_active: true,
  expires_after_days: null,
  quantity: null,
  max_per_user: 1,
  created_at: "2026-01-01T00:00:00Z",
  menuItem: { name: "Meyumi Matcha Latte", is_available: true },
};

const mockMyVoucher = {
  id: "voucher-active-1",
  qr_token: "qr-abc-123",
  voucher_type: "DISCOUNT" as const,
  discount_type: "PERCENT" as const,
  discount_value: 10,
  menu_item_id: null,
  addon_option_id: null,
  covered_price_vnd: null,
  status: "ACTIVE" as const,
  expires_at: "2026-12-31T23:59:59Z",
  created_at: "2026-06-01T00:00:00Z",
  package: { name: "Giảm 10%", description: null, points_cost: 50 },
  menuItem: null,
  addonOption: null,
};

// ── listActiveVoucherPackages ─────────────────────────────────────────────────

describe("listActiveVoucherPackages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi đúng endpoint GET /api/voucher-packages", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [] },
    });

    await listActiveVoucherPackages();

    expect(apiClient.get).toHaveBeenCalledWith("/api/voucher-packages");
  });

  it("trả về mảng VoucherPackage[]", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockDiscountPackage, mockProductPackage] },
    });

    const result = await listActiveVoucherPackages();

    expect(result).toHaveLength(2);
    expect(result[0].voucher_type).toBe("DISCOUNT");
    expect(result[1].voucher_type).toBe("PRODUCT");
  });

  it("trả về mảng rỗng khi không có gói nào active", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [] },
    });

    const result = await listActiveVoucherPackages();

    expect(result).toHaveLength(0);
  });

  it("PRODUCT package có trường menuItem lồng nhau", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockProductPackage] },
    });

    const result = await listActiveVoucherPackages();

    expect(result[0].menuItem?.name).toBe("Meyumi Matcha Latte");
    expect(result[0].covered_price_vnd).toBe(50000);
  });

  it("ném lỗi khi API thất bại", async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Network error"));

    await expect(listActiveVoucherPackages()).rejects.toThrow();
  });
});

// ── listMyVouchers ────────────────────────────────────────────────────────────

describe("listMyVouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi đúng endpoint GET /api/profile/vouchers", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [] },
    });

    await listMyVouchers();

    expect(apiClient.get).toHaveBeenCalledWith("/api/profile/vouchers");
  });

  it("trả về mảng voucher của người dùng", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockMyVoucher] },
    });

    const result = await listMyVouchers();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("ACTIVE");
    expect(result[0].qr_token).toBe("qr-abc-123");
  });

  it("voucher có package info lồng nhau", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockMyVoucher] },
    });

    const result = await listMyVouchers();

    expect(result[0].package.name).toBe("Giảm 10%");
    expect(result[0].package.points_cost).toBe(50);
  });

  it("trả về mảng rỗng khi không có voucher nào", async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [] },
    });

    const result = await listMyVouchers();

    expect(result).toHaveLength(0);
  });
});

// ── exchangeVoucher ───────────────────────────────────────────────────────────

describe("exchangeVoucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi POST /api/profile/vouchers/exchange với package_id đúng", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        data: {
          id: "voucher-new-1",
          qr_token: "qr-xyz",
          voucher_type: "DISCOUNT",
          status: "ACTIVE",
          expires_at: null,
        },
      },
    });

    await exchangeVoucher("pkg-discount-1");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/profile/vouchers/exchange",
      { package_id: "pkg-discount-1" }
    );
  });

  it("trả về voucher mới được tạo", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        data: {
          id: "voucher-new-1",
          qr_token: "qr-xyz",
          voucher_type: "DISCOUNT",
          status: "ACTIVE",
          expires_at: "2026-12-31T23:59:59Z",
        },
      },
    });

    const result = await exchangeVoucher("pkg-discount-1");

    expect(result.id).toBe("voucher-new-1");
    expect(result.qr_token).toBe("qr-xyz");
    expect(result.status).toBe("ACTIVE");
  });

  it("ném lỗi INSUFFICIENT_POINTS khi không đủ điểm", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "Insufficient points. Required: 100, available: 20",
          code: "INSUFFICIENT_POINTS",
        },
      },
    });

    await expect(exchangeVoucher("pkg-product-1")).rejects.toMatchObject({
      response: { data: { code: "INSUFFICIENT_POINTS" } },
    });
  });

  it("ném lỗi VOUCHER_LIMIT_REACHED khi vượt giới hạn mỗi người", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "You have already redeemed the maximum allowed vouchers",
          code: "VOUCHER_LIMIT_REACHED",
        },
      },
    });

    await expect(exchangeVoucher("pkg-discount-1")).rejects.toMatchObject({
      response: { data: { code: "VOUCHER_LIMIT_REACHED" } },
    });
  });

  it("ném lỗi VOUCHER_SOLD_OUT khi hết hàng", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "This voucher package is sold out",
          code: "VOUCHER_SOLD_OUT",
        },
      },
    });

    await expect(exchangeVoucher("pkg-discount-1")).rejects.toMatchObject({
      response: { data: { code: "VOUCHER_SOLD_OUT" } },
    });
  });

  it("ném lỗi NOT_FOUND khi package không tồn tại", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 404,
        data: { error: "Voucher package not found or inactive", code: "NOT_FOUND" },
      },
    });

    await expect(exchangeVoucher("pkg-nonexistent")).rejects.toMatchObject({
      response: { data: { code: "NOT_FOUND" } },
    });
  });
});
