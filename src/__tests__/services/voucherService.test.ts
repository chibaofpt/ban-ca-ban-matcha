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
  listMyVoucherPage,
  exchangeVoucher,
  claimFreeVoucher,
  refundVoucher,
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
  size: "SMALL" as const,
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

describe("claimFreeVoucher", () => {
  it("gọi endpoint FREE_CLAIM và trả trạng thái idempotent", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { data: { already_granted: true } },
    });

    const result = await claimFreeVoucher("pkg-free-1");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/profile/vouchers/claim",
      { package_id: "pkg-free-1" },
    );
    expect(result).toEqual({ already_granted: true });
  });
});

describe("refundVoucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gọi endpoint hoàn điểm bằng qr_token và trả số điểm mới", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        data: {
          qr_token: "bundle-refund-token",
          status: "REFUNDED",
          points_refunded: 80,
        },
      },
    });

    const result = await refundVoucher("bundle-refund-token");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/profile/vouchers/refund",
      { qr_token: "bundle-refund-token" },
    );
    expect(result).toEqual({
      qr_token: "bundle-refund-token",
      status: "REFUNDED",
      points_refunded: 80,
    });
  });

  it("giữ nguyên lỗi nghiệp vụ để UI hiển thị feedback", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "Voucher đã có lựa chọn trở lại",
          code: "BUSINESS_RULE_VIOLATION",
        },
      },
    });

    await expect(refundVoucher("bundle-refund-token")).rejects.toMatchObject({
      response: { data: { code: "BUSINESS_RULE_VIOLATION" } },
    });
  });
});

// ── listMyVouchers ────────────────────────────────────────────────────────────

describe("listMyVouchers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("gọi đúng endpoint GET /api/profile/vouchers", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { data: { granted_count: 0, expired_count: 0 } },
    });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [] },
    });

    await listMyVouchers();

    expect(apiClient.post).toHaveBeenCalledWith("/api/profile/vouchers/sync");
    expect(apiClient.get).toHaveBeenCalledWith("/api/profile/vouchers?limit=50&status=ACTIVE%2CRESERVED");
  });

  it("đọc đủ voucher ACTIVE qua cursor và chỉ sync một lần", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...mockMyVoucher, qr_token: `active-${index}`,
    }));
    const lastVoucher = { ...mockMyVoucher, qr_token: "older-active" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: {
        data: firstPage, meta: { limit: 50, has_more: true, next_cursor: "opaque-cursor" },
      } })
      .mockResolvedValueOnce({ data: {
        data: [lastVoucher], meta: { limit: 50, has_more: false, next_cursor: null },
      } });

    const result = await listMyVouchers();

    expect(result).toEqual([...firstPage, lastVoucher]);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, "/api/profile/vouchers?limit=50&status=ACTIVE%2CRESERVED");
    expect(apiClient.get).toHaveBeenNthCalledWith(2, "/api/profile/vouchers?limit=50&status=ACTIVE%2CRESERVED&cursor=opaque-cursor");
  });

  it("không trả ví thiếu khi trang tiếp theo lỗi", async () => {
    const error = { response: { status: 503, data: { error: "Tạm thời không đọc được ví", code: "INTERNAL_ERROR" } } };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: { data: [mockMyVoucher], meta: { limit: 50, has_more: true, next_cursor: "next" } } })
      .mockRejectedValueOnce(error);
    await expect(listMyVouchers()).rejects.toBe(error);
  });

  it("từ chối cursor lặp thay vì treo tải ví", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get).mockResolvedValue({ data: {
      data: [mockMyVoucher], meta: { limit: 50, has_more: true, next_cursor: "repeated" },
    } });
    await expect(listMyVouchers()).rejects.toThrow("Không thể tải đầy đủ ví voucher");
  });

  it("giữ voucher RESERVED để hiển thị đơn đang giữ voucher", async () => {
    const reserved = { ...mockMyVoucher, qr_token: "reserved", status: "RESERVED" };
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: {
      data: [reserved], meta: { limit: 50, has_more: false, next_cursor: null },
    } });
    expect(await listMyVouchers()).toEqual([reserved]);
  });

  it("lịch sử giữ metadata và chỉ đọc một trang với cursor được mã hóa", async () => {
    const response = { data: [{ ...mockMyVoucher, status: "REDEEMED" }],
      meta: { limit: 50, has_more: true, next_cursor: "later" } };
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: response });
    expect(await listMyVoucherPage({ statuses: ["REDEEMED", "EXPIRED"], cursor: "opaque+/=" })).toEqual(response);
    expect(apiClient.get).toHaveBeenCalledExactlyOnceWith("/api/profile/vouchers?limit=50&status=REDEEMED%2CEXPIRED&cursor=opaque%2B%2F%3D");
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("trả về mảng voucher của người dùng", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockMyVoucher] },
    });

    const result = await listMyVouchers();

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("ACTIVE");
    expect(result[0].qr_token).toBe("qr-abc-123");
  });

  it("voucher có package info lồng nhau", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { data: [mockMyVoucher] },
    });

    const result = await listMyVouchers();

    expect(result[0].package.name).toBe("Giảm 10%");
    expect(result[0].package.points_cost).toBe(50);
  });

  it("trả về mảng rỗng khi không có voucher nào", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { data: {} } });
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
