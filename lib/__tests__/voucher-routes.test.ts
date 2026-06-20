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

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

const mockVoucherFindUnique = vi.fn();
const mockVoucherCreate = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockVoucherCount = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockMenuItemFindUnique = vi.fn();
const mockVoucherPackageFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      create: (...args: unknown[]) => mockVoucherCreate(...args),
      update: (...args: unknown[]) => mockVoucherUpdate(...args),
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
    },
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
const QR_TOKEN = "qr-abc-123";

const customerSession = { id: USER_ID, role: "CUSTOMER" };

const activePackage = {
  id: PKG_ID,
  name: "Free Trà Xanh Sữa M",
  description: null,
  voucher_type: "PRODUCT",
  points_cost: 5,
  discount_type: null,
  discount_value: null,
  menu_item_id: MENU_ITEM_ID,
  size: "M",
  matcha_powder_id: null,
  milk_type_id: null,
  included_addon_option_ids: [],
  addon_option_id: null,
  covered_price_vnd: 65000,
  is_active: true,
  expires_after_days: 30,
  quantity: null,        // unlimited
  max_per_user: 1,
  created_at: new Date(),
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
  mockTransaction.mockImplementation(async (fn: (tx: any) => unknown) => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: {
        update: vi.fn().mockImplementation(async (args) => {
          await mockUserUpdate(args);
          return { points_balance: 100 };
        }),
      },
      voucher: {
        create: mockVoucherCreate,
        update: mockVoucherUpdate,
        count: mockVoucherCount,
      },
      pointsLog: { create: mockPointsLogCreate },
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
    // Default: unlimited quantity, user hasn't redeemed yet
    mockVoucherCount.mockResolvedValue(0);
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await exchangePOST(makeRequest({ package_id: PKG_ID }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHORIZED");
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
          size: "M",
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
    // size + matcha_powder_id required by refund route L101-L112
    size: "M",
    matcha_powder_id: null,
    package: { points_cost: 5 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(customerSession);
    mockVoucherUpdate.mockResolvedValue({});
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        voucher: { update: mockVoucherUpdate },
        user: { update: mockUserUpdate },
        pointsLog: { create: mockPointsLogCreate },
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

  it("returns 400 when voucher is not PRODUCT type", async () => {
    mockVoucherFindUnique.mockResolvedValue({ ...productVoucher, voucher_type: "DISCOUNT" });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
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
    mockMenuItemFindUnique.mockResolvedValue({
      is_available: true,
      name: "Trà Xanh",
      category: "latte",
      default_powder_id: null,
      // sizes + fusionAllowedPowders required by refund route L101-L112
      sizes: [{ size: "M", base_price_vnd: 45000 }],
      fusionAllowedPowders: [],
    });
    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CONFLICT");
  });

  it("refunds successfully when menu item is unavailable (soft-deleted)", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindUnique.mockResolvedValue({ is_available: false, name: "Trà Xanh (ngưng)" });

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("REFUNDED");
    expect(json.data.points_refunded).toBe(5);
  });

  it("refunds successfully when menu item is null (hard deleted edge case)", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindUnique.mockResolvedValue(null);

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("REFUNDED");
  });

  it("marks voucher as REFUNDED in transaction", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher);
    mockMenuItemFindUnique.mockResolvedValue({ is_available: false, name: "Trà Xanh (ngưng)" });

    await refundPOST(makeRefundReq(refundPayload));

    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VOUCHER_ID },
        data: { status: "REFUNDED" },
      })
    );
  });

  it("increments user points_balance by package.points_cost", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher); // points_cost = 5
    mockMenuItemFindUnique.mockResolvedValue({ is_available: false, name: "Trà Xanh (ngưng)" });

    await refundPOST(makeRefundReq(refundPayload));

    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { points_balance: { increment: 5 } },
      })
    );
  });

  it("logs points_log with reason 'voucher_refund' and correct delta", async () => {
    mockVoucherFindUnique.mockResolvedValue(productVoucher); // points_cost = 5
    mockMenuItemFindUnique.mockResolvedValue({ is_available: false, name: "Trà Xanh (ngưng)" });

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

  it("returns 500 on DB error", async () => {
    mockVoucherFindUnique.mockRejectedValue(new Error("timeout"));

    const res = await refundPOST(makeRefundReq(refundPayload));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("INTERNAL_ERROR");
  });
});
