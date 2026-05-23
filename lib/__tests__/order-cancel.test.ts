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
const mockVoucherUpdate = vi.fn();
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
    // Default: transaction calls the callback with a mock tx
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        order: { update: mockOrderUpdate },
        voucher: { update: mockVoucherUpdate },
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
    });
    mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("CANCELLED");
    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "order-123" },
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
    });
    mockOrderUpdate.mockResolvedValue({ id: "order-123", status: "CANCELLED" });
    mockVoucherUpdate.mockResolvedValue({ id: "voucher-xyz", status: "ACTIVE" });

    const { PATCH } = await import("@/app/api/orders/[id]/route");
    const res = await PATCH(makeReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-123" }),
    });
    expect(res.status).toBe(200);
    expect(mockVoucherUpdate).toHaveBeenCalledWith({
      where: { id: "voucher-xyz" },
      data: { status: "ACTIVE" },
    });
  });
});
