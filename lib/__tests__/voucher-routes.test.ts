/**
 * Unit tests for POST /api/profile/vouchers/exchange
 * and POST /api/profile/vouchers/refund.
 *
 * Strategy: mock lib/prisma and lib/auth. Keep route handler real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockVoucherFindUnique = vi.fn();
const mockVoucherCreate = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockVoucherCount = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockMenuItemFindUnique = vi.fn();
const mockMenuItemFindMany = vi.fn();
const mockMatchaPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockAddonOptionFindMany = vi.fn();
const mockVoucherPackageFindUnique = vi.fn();
const mockTransaction = vi.fn();
const mockVoucherGrantFindUnique = vi.fn();
const mockVoucherGrantCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      create: (...args: unknown[]) => mockVoucherCreate(...args),
      update: (...args: unknown[]) => mockVoucherUpdate(...args),
      updateMany: (...args: unknown[]) => mockVoucherUpdateMany(...args),
      count: (...args: unknown[]) => mockVoucherCount(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    pointsLog: {
      create: (...args: unknown[]) => mockPointsLogCreate(...args),
    },
    menuItem: {
      findUnique: (...args: unknown[]) => mockMenuItemFindUnique(...args),
      findMany: (...args: unknown[]) => mockMenuItemFindMany(...args),
    },
    matchaPowder: { findMany: (...args: unknown[]) => mockMatchaPowderFindMany(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    addonOption: { findMany: (...args: unknown[]) => mockAddonOptionFindMany(...args) },
    voucherPackage: {
      findUnique: (...args: unknown[]) => mockVoucherPackageFindUnique(...args),
    },
  },
}));

// Import after mocks
import { POST as exchangePOST } from "@/app/api/profile/vouchers/exchange/route";
import { POST as refundPOST } from "@/app/api/profile/vouchers/refund/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const PKG_ID = "550e8400-e29b-41d4-a716-446655440002";
const VOUCHER_ID = "550e8400-e29b-41d4-a716-446655440003";
const MENU_ITEM_ID = "550e8400-e29b-41d4-a716-446655440004";
const POWDER_ID = "550e8400-e29b-41d4-a716-446655440005";
const LIQUID_ID = "550e8400-e29b-41d4-a716-446655440006";
const QR_TOKEN = "qr-abc-123";

const customerSession = { id: USER_ID, role: "CUSTOMER" };

const activePackage = {
  id: PKG_ID,
  name: "Free Trà Xanh Sữa M",
  description: null,
  voucher_type: "PRODUCT",
  acquisition_mode: "POINTS_EXCHANGE",
  points_cost: 5,
  discount_type: null,
  discount_value: null,
  menu_item_id: MENU_ITEM_ID,
  size: "SMALL",
  matcha_powder_id: null,
  milk_type_id: null,
  included_addon_option_ids: [],
  addon_option_id: null,
  covered_price_vnd: 65000,
  covered_delivery_fee_vnd: null,
  min_order_vnd: null,
  is_active: true,
  expires_after_days: 30,
  quantity: null,        // unlimited
  max_per_user: 1,
  created_at: new Date(),
  bundleRule: null,
};

const createdVoucher = {
  id: VOUCHER_ID,
  qr_token: QR_TOKEN,
  voucher_type: "PRODUCT",
  status: "ACTIVE",
  expires_at: new Date(Date.now() + 30 * 86400000),
};

function makeRequest(body: unknown, url = "http://localhost/api/profile/vouchers/exchange"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Helper: setup $transaction to run callback ────────────────────────────────

function setupTransaction() {
  type TransactionMock = {
    voucherPackage: { findUnique: typeof mockVoucherPackageFindUnique };
    user: { updateMany: ReturnType<typeof vi.fn> };
    voucher: {
      create: typeof mockVoucherCreate;
      update: typeof mockVoucherUpdate;
      count: typeof mockVoucherCount;
    };
    pointsLog: { create: typeof mockPointsLogCreate };
    voucherGrant: {
      findUnique: typeof mockVoucherGrantFindUnique;
      create: typeof mockVoucherGrantCreate;
    };
    menuItem: { findMany: typeof mockMenuItemFindMany };
    matchaPowder: { findMany: typeof mockMatchaPowderFindMany };
    milkType: { findMany: typeof mockMilkTypeFindMany };
    addonOption: { findMany: typeof mockAddonOptionFindMany };
  };
  mockTransaction.mockImplementation(async (fn: (tx: TransactionMock) => unknown) => {
    const tx = {
      voucherPackage: { findUnique: mockVoucherPackageFindUnique },
      user: {
        updateMany: vi.fn().mockImplementation(async (args) => {
          await mockUserUpdate(args);
          const user = await mockUserFindUnique();
          const required = args.where.points_balance.gte as number;
          return { count: user && user.points_balance >= required ? 1 : 0 };
        }),
      },
      voucher: {
        create: mockVoucherCreate,
        update: mockVoucherUpdate,
        count: mockVoucherCount,
      },
      pointsLog: { create: mockPointsLogCreate },
      voucherGrant: {
        findUnique: mockVoucherGrantFindUnique,
        create: mockVoucherGrantCreate,
      },
      menuItem: { findMany: mockMenuItemFindMany },
      matchaPowder: { findMany: mockMatchaPowderFindMany },
      milkType: { findMany: mockMilkTypeFindMany },
      addonOption: { findMany: mockAddonOptionFindMany },
    };
    return fn(tx);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/profile/vouchers/exchange
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/profile/vouchers/exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(customerSession);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
    // Default: unlimited quantity, user hasn't redeemed yet
    mockVoucherCount.mockResolvedValue(0);
    mockVoucherGrantFindUnique.mockResolvedValue(null);
    mockMenuItemFindMany.mockResolvedValue([{
      id: MENU_ITEM_ID, name: "Trà Xanh", category: "latte", is_available: true,
      unit_price_vnd: null, matcha_powder_id: POWDER_ID, default_powder_id: null,
      default_base_liquid_id: null, sizes: [{ size: "SMALL", base_price_vnd: 45_000 }], allowedBaseLiquids: [],
    }]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: POWDER_ID, name: "Meyumi", price_per_gram: 100, is_available: true }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: LIQUID_ID, is_active: true, is_default: true, display_order: 0 }]);
    mockAddonOptionFindMany.mockResolvedValue([]);
    setupTransaction();
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("trả 429 với Retry-After khi tài khoản đổi quá 5 voucher mỗi phút", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 37 });

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("37");
    expect(mockCheckRateLimit).toHaveBeenCalledWith("voucherExchangeAccount", USER_ID);
    expect(mockVoucherPackageFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for missing package_id", async () => {
    const res = await exchangePOST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid UUID package_id", async () => {
    const res = await exchangePOST(makeRequest({ package_id: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when package does not exist", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ points_balance: 100 });

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 404 when package is inactive", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue({ ...activePackage, is_active: false });
    mockUserFindUnique.mockResolvedValue({ points_balance: 100 });

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 422 INSUFFICIENT_POINTS when user has fewer points than cost", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(activePackage); // costs 5 points
    mockUserFindUnique.mockResolvedValue({ points_balance: 3 }); // only has 3

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("INSUFFICIENT_POINTS");
  });

  it("creates voucher and returns 201 on success", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(activePackage);
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.qr_token).toBe(QR_TOKEN);
    expect(json.data.status).toBe("ACTIVE");
  });

  it("deducts points_cost from user balance in transaction", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(activePackage); // cost = 5
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    await exchangePOST(makeRequest({ package_id: PKG_ID }));

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { points_balance: { decrement: 5 } },
      })
    );
  });

  it("creates points_log with reason 'voucher_purchase' and negative delta", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(activePackage);
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    await exchangePOST(makeRequest({ package_id: PKG_ID }));

    expect(mockPointsLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: -5, // negative — points deducted
          reason: "voucher_purchase",
          voucher_id: VOUCHER_ID,
        }),
      })
    );
  });

  it("snapshots all package fields into the voucher", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue(activePackage);
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    await exchangePOST(makeRequest({ package_id: PKG_ID }));

    expect(mockVoucherCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voucher_type: "PRODUCT",
          menu_item_id: MENU_ITEM_ID,
          size: "SMALL",
          covered_price_vnd: 65000,
        }),
      })
    );
  });

  it("sets expires_at based on expires_after_days from package", async () => {
    const now = Date.now();
    mockVoucherPackageFindUnique.mockResolvedValue({ ...activePackage, expires_after_days: 7 });
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    await exchangePOST(makeRequest({ package_id: PKG_ID }));

    const createCall = mockVoucherCreate.mock.calls[0][0];
    const expiresAt: Date = createCall.data.expires_at;
    const diffMs = expiresAt.getTime() - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("sets expires_at = null when package has no expires_after_days", async () => {
    mockVoucherPackageFindUnique.mockResolvedValue({ ...activePackage, expires_after_days: null });
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });
    mockVoucherCreate.mockResolvedValue(createdVoucher);
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    setupTransaction();

    await exchangePOST(makeRequest({ package_id: PKG_ID }));

    expect(mockVoucherCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expires_at: null }),
      })
    );
  });

  it("returns 500 on unexpected DB error", async () => {
    mockVoucherPackageFindUnique.mockRejectedValue(new Error("DB failure"));
    mockUserFindUnique.mockResolvedValue({ points_balance: 10 });

    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/profile/vouchers/refund
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/profile/vouchers/refund", () => {
  const refundPayload = { qr_token: QR_TOKEN };
  const refundUrl = "http://localhost/api/profile/vouchers/refund";

  function makeRefundReq(body: unknown) {
    return makeRequest(body, refundUrl);
  }

  const productVoucher = {
    id: VOUCHER_ID,
    user_id: USER_ID,
    qr_token: QR_TOKEN,
    voucher_type: "PRODUCT",
    status: "ACTIVE",
    menu_item_id: MENU_ITEM_ID,
    size: "SMALL",
    matcha_powder_id: POWDER_ID,
    milk_type_id: LIQUID_ID,
    addon_option_id: null,
    issued_via: "POINTS_EXCHANGE",
    expires_at: new Date(Date.now() + 86_400_000),
    pointsLogs: [{ delta: -5, reason: "voucher_purchase" }],
    package: { points_cost: 99, bundleRule: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(customerSession);
    mockVoucherUpdate.mockResolvedValue({});
    mockVoucherUpdateMany.mockResolvedValue({ count: 1 });
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    mockMenuItemFindMany.mockResolvedValue([{
      id: MENU_ITEM_ID, is_available: true, name: "Trà Xanh", category: "latte",
      unit_price_vnd: null, matcha_powder_id: POWDER_ID, default_powder_id: null,
      default_base_liquid_id: null, sizes: [{ size: "SMALL", base_price_vnd: 45_000 }],
      allowedBaseLiquids: [],
    }]);
    mockMatchaPowderFindMany.mockResolvedValue([{ id: POWDER_ID, name: "Meyumi", price_per_gram: 100, is_available: true }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: LIQUID_ID, is_active: true, is_default: true, display_order: 0 }]);
    mockAddonOptionFindMany.mockResolvedValue([]);

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        voucher: { findUnique: mockVoucherFindUnique, updateMany: mockVoucherUpdateMany },
        user: { update: mockUserUpdate },
        pointsLog: { create: mockPointsLogCreate },
        menuItem: { findMany: mockMenuItemFindMany },
        matchaPowder: { findMany: mockMatchaPowderFindMany },
        milkType: { findMany: mockMilkTypeFindMany },
        addonOption: { findMany: mockAddonOptionFindMany },
      };
      return fn(tx);
    });
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing qr_token", async () => {
    const res = await refundPOST(makeRefundReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when voucher not found", async () => {
    mockVoucherFindUnique.mockResolvedValue(null);
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("returns 404 when voucher belongs to another user", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      ...productVoucher,
      user_id: "other-user-id",
    });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });

  it("không hoàn voucher vẫn còn sử dụng được", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      ...productVoucher, voucher_type: "DISCOUNT", menu_item_id: null, size: null,
      matcha_powder_id: null, milk_type_id: null,
    });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("returns 409 when voucher is already REDEEMED", async () => {
    mockVoucherFindUnique.mockResolvedValue({ ...productVoucher, status: "REDEEMED" });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("returns 409 when voucher is already REFUNDED", async () => {
    mockVoucherFindUnique.mockResolvedValue({ ...productVoucher, status: "REFUNDED" });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("returns 409 when menu item is still available (cannot refund)", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("refunds successfully when menu item is unavailable (soft-deleted)", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("REFUNDED");
    expect(json.data.points_refunded).toBe(5);
  });

  it("refunds an ITEM voucher for an unavailable extras item", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      ...productVoucher,
      voucher_type: "ITEM",
      size: null,
      matcha_powder_id: null,
      milk_type_id: null,
    });
    mockMenuItemFindMany.mockResolvedValue([]);

    const res = await refundPOST(makeRefundReq(refundPayload));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { status: "REFUNDED", points_refunded: 5 },
    });
  });

  it("refunds successfully when menu item is null (hard deleted edge case)", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("REFUNDED");
  });

  it("marks voucher as REFUNDED in transaction", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);

    await refundPOST(makeRefundReq(refundPayload));

    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: VOUCHER_ID, status: "ACTIVE" }),
        data: { status: "REFUNDED" },
      })
    );
  });

  it("hoàn đúng điểm từ immutable purchase log thay vì package hiện tại", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);

    await refundPOST(makeRefundReq(refundPayload));

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { points_balance: { increment: 5 } },
      })
    );
  });

  it("logs points_log with reason 'voucher_refund' and correct delta", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);

    await refundPOST(makeRefundReq(refundPayload));

    expect(mockPointsLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: 5,
          reason: "voucher_refund",
          voucher_id: VOUCHER_ID,
        }),
      })
    );
  });

  it("từ chối voucher miễn phí dù target không còn sử dụng được", async () => {
    mockVoucherFindUnique.mockResolvedValue({ ...productVoucher, issued_via: "FREE_CLAIM" });
    mockMenuItemFindMany.mockResolvedValue([]);
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(422);
    expect((await res.json()).details.reason).toBe("REFUND_NOT_POINTS_EXCHANGE");
  });

  it("trả audit missing thay vì đoán theo giá package hiện tại", async () => {
    mockVoucherFindUnique.mockResolvedValue({ ...productVoucher, pointsLogs: [] });
    mockMenuItemFindMany.mockResolvedValue([]);
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(422);
    expect((await res.json()).details.reason).toBe("REFUND_AUDIT_MISSING");
  });

  it("chặn double-refund khi expected-state updateMany không còn match", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);
    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("đọc target và audit bên trong transaction trước khi claim trạng thái", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindMany.mockResolvedValue([]);
    await refundPOST(makeRefundReq(refundPayload));
    expect(mockTransaction).toHaveBeenCalledOnce();
    expect(mockTransaction.mock.invocationCallOrder[0]).toBeLessThan(mockVoucherFindUnique.mock.invocationCallOrder[0]!);
    expect(mockMenuItemFindMany.mock.invocationCallOrder[0]).toBeLessThan(mockVoucherUpdateMany.mock.invocationCallOrder[0]!);
  });

  it("retry P2034 có giới hạn rồi trả 409 thay vì 500", async () => {
    mockTransaction.mockRejectedValue({ code: "P2034" });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it("returns 500 on DB error", async () => {
    mockVoucherFindUnique.mockRejectedValue(new Error("timeout"));

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});
