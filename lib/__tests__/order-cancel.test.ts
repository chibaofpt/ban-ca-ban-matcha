/**
 * Unit tests for PATCH /api/orders/[id] (customer self-cancel).
 * Strategy: mock lib/prisma and lib/auth — test all business rule branches.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockOrderItemFindMany = vi.fn();
const mockPointsLogFindMany = vi.fn();
const mockUserUpdate = vi.fn();
const mockOrderDiscountVoucherFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: vi.fn().mockReturnValue("https://example.com/qr"),
}));

// ── Helper ────────────────────────────────────────────────────────────────────

function makeReq(body: unknown, orderId = "order-123") {
  return new NextRequest(`http://localhost/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CUSTOMER_SESSION = { id: "user-abc", role: "CUSTOMER", phone_number: "+84900000001" };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/orders/[id] — customer self-cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderItemFindMany.mockResolvedValue([]);
    mockPointsLogFindMany.mockResolvedValue([]);
    mockOrderDiscountVoucherFindMany.mockResolvedValue([]);

    // Default: transaction calls the callback with a mock tx that includes all needed tables
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        order: {
          update: mockOrderUpdate,
          updateMany: mockOrderUpdateMany,
          findUnique: mockOrderFindUnique,
        },
        voucher: { findUnique: mockVoucherFindUnique, update: mockVoucherUpdate },
        orderItem: { findMany: mockOrderItemFindMany },
        pointsLog: { findMany: mockPointsLogFindMany, create: vi.fn() },
        user: { update: mockUserUpdate },
        orderDiscountVoucher: { findMany: mockOrderDiscountVoucherFindMany },
        orderItemAddonVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      };
      return fn(tx);
    });
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when role is not CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({ id: "admin-1", role: "ADMIN", phone_number: "+84900000000" });
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("FORBIDDEN");
  });

  it("returns 400 when body.status is not CANCELLED", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when order does not exist", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 404 when order belongs to different user (security check)", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "different-user", // NOT the session user
      voucher_id: null,
      addon_voucher_id: null,
    });
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 when order is not PENDING", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "ADMIN_CONFIRMED", // Cannot cancel non-PENDING
      user_id: "user-abc",
      voucher_id: null,
      addon_voucher_id: null,
    });
    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe("INVALID_STATUS");
  });

  it("cancels PENDING order without voucher", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "user-abc",
      voucher_id: null,
      addon_voucher_id: null,
    });
    mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("CANCELLED");
    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: "order-123", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    // No voucher — voucher update should NOT be called
    expect(mockVoucherUpdate).not.toHaveBeenCalled();
  });

  it("restores voucher to ACTIVE when cancelling an order with RESERVED voucher", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "user-abc",
      voucher_id: "voucher-xyz",
      addon_voucher_id: null,
    });
    mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" });
    mockOrderDiscountVoucherFindMany.mockResolvedValue([{ voucher_id: "voucher-xyz" }]);
    // restoreVouchersOnCancel calls findUnique to check current status
    mockVoucherFindUnique.mockResolvedValue({ status: "RESERVED" });
    mockVoucherUpdate.mockResolvedValue({ id: "voucher-xyz", status: "ACTIVE" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(200);
    expect(mockVoucherUpdate).toHaveBeenCalledWith({
      where: { id: "voucher-xyz" },
      data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
    });
  });

  it("restores FREESHIP voucher to ACTIVE when cancelling an order", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "user-abc",
      freeship_voucher_id: "freeship-1",
    });
    mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" });
    
    // restoreVouchersOnCancel calls findUnique to check current status
    mockVoucherFindUnique.mockResolvedValue({ status: "RESERVED" });
    mockVoucherUpdate.mockResolvedValue({ id: "freeship-1", status: "ACTIVE" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    
    expect(res.status).toBe(200);
    expect(mockVoucherUpdate).toHaveBeenCalledWith({
      where: { id: "freeship-1" },
      data: { status: "ACTIVE", redeemed_at: null, redeemed_by: null, used_channel: null },
    });
  });
});
// ── restoreVouchersOnCancel — voucher expiry ─────────────────────────────────

describe("restoreVouchersOnCancel — voucher expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderItemFindMany.mockResolvedValue([]);
    mockPointsLogFindMany.mockResolvedValue([]);
    mockOrderDiscountVoucherFindMany.mockResolvedValue([]);
  });

  it("Voucher quá hạn khi cancel → trả về EXPIRED, không ACTIVE", async () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday

    // Pre-transaction findUnique (ownership check at line 181)
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "user-001",
    });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        order: {
          update: mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" }),
          updateMany: mockOrderUpdateMany,
          findUnique: vi.fn().mockResolvedValue({
            freeship_voucher_id: "freeship-expired",
          }),
        },
        voucher: {
          findUnique: mockVoucherFindUnique.mockResolvedValue({
            id: "freeship-expired",
            status: "RESERVED",
            expires_at: expiredDate,
          }),
          update: mockVoucherUpdate,
        },
        orderItem: { findMany: mockOrderItemFindMany },
        orderDiscountVoucher: { findMany: mockOrderDiscountVoucherFindMany },
        orderItemAddonVoucher: { findMany: vi.fn().mockResolvedValue([]) },
        pointsLog: { findMany: mockPointsLogFindMany, create: vi.fn() },
        user: { update: mockUserUpdate },
      };
      return fn(tx);
    });

    mockGetSession.mockResolvedValue({ id: "user-001", role: "CUSTOMER" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });

    expect(res.status).toBe(200);

    // Voucher should be set to EXPIRED, not ACTIVE
    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "freeship-expired" },
        data: expect.objectContaining({ status: "EXPIRED" }),
      })
    );
  });

  it("Voucher chưa hết hạn khi cancel → trả về ACTIVE bình thường", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week

    // Pre-transaction findUnique (ownership check)
    mockOrderFindUnique.mockResolvedValue({
      id: "order-123",
      status: "PENDING",
      user_id: "user-001",
    });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        order: {
          update: mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" }),
          updateMany: mockOrderUpdateMany,
          findUnique: vi.fn().mockResolvedValue({
            freeship_voucher_id: "freeship-valid",
          }),
        },
        voucher: {
          findUnique: mockVoucherFindUnique.mockResolvedValue({
            id: "freeship-valid",
            status: "RESERVED",
            expires_at: futureDate,
          }),
          update: mockVoucherUpdate,
        },
        orderItem: { findMany: mockOrderItemFindMany },
        orderDiscountVoucher: { findMany: mockOrderDiscountVoucherFindMany },
        orderItemAddonVoucher: { findMany: vi.fn().mockResolvedValue([]) },
        pointsLog: { findMany: mockPointsLogFindMany, create: vi.fn() },
        user: { update: mockUserUpdate },
      };
      return fn(tx);
    });

    mockGetSession.mockResolvedValue({ id: "user-001", role: "CUSTOMER" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });

    expect(res.status).toBe(200);

    // Voucher should be restored to ACTIVE
    expect(mockVoucherUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "freeship-valid" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });
});
