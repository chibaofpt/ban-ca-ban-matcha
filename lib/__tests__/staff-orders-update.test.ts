/**
 * Unit tests cho việc update status của order (PATCH /api/staff/orders/[id])
 * Tập trung vào luồng chuyển sang COMPLETED: cập nhật trạng thái voucher, cộng điểm dư (surplus_points).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared BEFORE imports ────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockRestoreVouchersOnCancel = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/cancelOrder", () => ({
  restoreVouchersOnCancel: (...args: unknown[]) => mockRestoreVouchersOnCancel(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

// Import SAU mock
import { PATCH } from "@/app/api/staff/orders/[id]/route";
import { prisma } from "@/lib/prisma";

// ── Constants & Helpers ──────────────────────────────────────────────────────

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const STAFF_SESSION = { id: "550e8400-e29b-41d4-a716-446655440003", role: "STAFF" };

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/staff/orders/${ORDER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupTx() {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (tx: unknown) => unknown) => {
      const tx = {
        order: {
          findUnique: mockOrderFindUnique,
          update: mockOrderUpdate,
        },
        user: { update: mockUserUpdate },
        pointsLog: { create: mockPointsLogCreate },
        voucher: {
          findUnique: mockVoucherFindUnique,
          update: mockVoucherUpdate,
          updateMany: mockVoucherUpdateMany,
        },
      };
      return fn(tx);
    }
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PATCH /api/staff/orders/[id] — cập nhật trạng thái", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTx();
  });

  it("Khi update status thành COMPLETED, cập nhật PRODUCT, DISCOUNT, ADDON, FREESHIP vouchers sang REDEEMED", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    
    // Order đang STAFF_DONE, có product, discount, addon, freeship vouchers
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      freeship_voucher_id: "freeship-v1",
      items: [
        { 
          product_voucher_id: "product-v1", 
          surplus_points: 0,
          addonVouchers: [{ voucher_id: "addon-v1" }]
        }
      ],
      discountVouchers: [
        { voucher_id: "discount-v1" }
      ]
    });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Verify voucher.updateMany was called with array of all 4 voucher IDs
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: expect.objectContaining({
          in: expect.arrayContaining(["freeship-v1", "discount-v1", "product-v1", "addon-v1"])
        }),
        status: "RESERVED"
      }),
      data: expect.objectContaining({ status: "REDEEMED" })
    }));
  });

  it("Khi update status thành COMPLETED, cộng surplus_points cho user và ghi PointsLog với reason voucher_surplus", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      freeship_voucher_id: null,
      discountVouchers: [],
      items: [
        { product_voucher_id: "product-v1", surplus_points: 5, addonVouchers: [] }
      ],
    });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Verify PointsLog is created for voucher_surplus
    expect(mockPointsLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reason: "voucher_surplus",
        delta: 5,
        voucher_id: "product-v1"
      })
    }));

    // Verify user update includes surplus points (increment: 5)
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID },
      data: { points_balance: { increment: 5 } }
    }));
  });

  it("Khi update status thành COMPLETED, không cộng surplus_points nếu user_id là null (khách vãng lai)", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "COUNTER",
      points_earned: null,
      user_id: null,
      total_vnd: 50000,
      freeship_voucher_id: null,
      discountVouchers: [],
      items: [
        { product_voucher_id: "product-v1", surplus_points: 5, addonVouchers: [] } // Though anonymous shouldn't have vouchers, test to ensure safety
      ],
    });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Verify no PointsLog for voucher_surplus
    const calls = mockPointsLogCreate.mock.calls;
    const surplusLog = calls.find(c => c[0].data.reason === "voucher_surplus");
    expect(surplusLog).toBeUndefined();
  });
});
