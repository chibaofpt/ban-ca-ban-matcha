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
const mockOrderUpdateMany = vi.fn();
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
          updateMany: mockOrderUpdateMany,
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
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    setupTx();
  });

  it("Khi update status thành COMPLETED, KHÔNG redeem voucher lại (đã redeem ở ADMIN_CONFIRMED)", async () => {
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
      handled_by: null,
      freeship_voucher_id: "freeship-v1",
      items: [
        { 
          product_voucher_id: "product-v1", 
          unit_price_vnd: 50000,
          productVoucher: { covered_price_vnd: 50000 },
          addonVouchers: [{ voucher_id: "addon-v1" }]
        }
      ],
      discountVouchers: [
        { voucher_id: "discount-v1" }
      ]
    });

    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Voucher redeem should NOT happen at COMPLETED (already done at ADMIN_CONFIRMED)
    expect(mockVoucherUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REDEEMED" }),
      })
    );
  });

  it("Khi update status thành COMPLETED, cộng aggregate surplus_points từ covered_price_vnd - unit_price_vnd", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: null,
      discountVouchers: [],
      items: [
        { product_voucher_id: "product-v1", unit_price_vnd: 30000, productVoucher: { covered_price_vnd: 55000 }, addonVouchers: [] }
      ],
    });

    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Aggregate surplus: max(55000 - 30000, 0) = 25000 → floor(25000/10000) = 2 points
    expect(mockPointsLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        reason: "voucher_surplus",
        delta: 2,
        voucher_id: null, // Aggregate — not per-item
      })
    }));

    // Verify user update includes surplus points (increment: 2)
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: USER_ID },
      data: { points_balance: { increment: 2 } }
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
        { product_voucher_id: "product-v1", addonVouchers: [] } // Though anonymous shouldn't have vouchers, test to ensure safety
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
// ── ADMIN_CONFIRMED qua generic endpoint ────────────────────────────────────

const ADMIN_SESSION = { id: "550e8400-e29b-41d4-a716-446655440004", role: "ADMIN" };

describe("PATCH /api/staff/orders/[id] — ADMIN_CONFIRMED qua generic endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTx();
  });

  it("Admin gọi generic PATCH với status ADMIN_CONFIRMED → gọi cùng helper, redeem voucher", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "PENDING",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: "freeship-v1",
      items: [
        { product_voucher_id: "product-v1", addonVouchers: [{ voucher_id: "addon-v1" }] }
      ],
      discountVouchers: [{ voucher_id: "discount-v1" }],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 4 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "ADMIN_CONFIRMED" });

    const res = await PATCH(makeReq({ status: "ADMIN_CONFIRMED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Should redeem vouchers via updateMany with status RESERVED condition
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "RESERVED" }),
        data: expect.objectContaining({ status: "REDEEMED" }),
      })
    );
  });

  it("Admin gọi generic PATCH với status ADMIN_CONFIRMED → không cộng points", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "PENDING",
      order_type: "DELIVERY",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 80000,
      grand_total_vnd: 105000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [{ product_voucher_id: null, addonVouchers: [] }],
      discountVouchers: [],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "ADMIN_CONFIRMED" });

    const res = await PATCH(makeReq({ status: "ADMIN_CONFIRMED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // No points should be awarded
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });
});
// ── COMPLETED points và surplus ────────────────────────────────────────────

describe("PATCH /api/staff/orders/[id] — COMPLETED points và surplus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    setupTx();
  });

  it("COMPLETED dùng floor(total_vnd / 10000) → không dùng grand_total_vnd", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "DELIVERY",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 72000,
      grand_total_vnd: 97000, // includes 25k shipping
      handled_by: null,
      freeship_voucher_id: null,
      items: [{ product_voucher_id: null, addonVouchers: [] }],
      discountVouchers: [],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Points = floor(72000 / 10000) = 7, NOT floor(97000 / 10000) = 9
    expect(mockPointsLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: "order_complete",
          delta: 7,
        }),
      })
    );
  });

  it("COMPLETED không redeem voucher lần nữa nếu đã REDEEMED ở ADMIN_CONFIRMED", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: "freeship-v1",
      items: [
        { product_voucher_id: "product-v1", unit_price_vnd: 50000, covered_price_vnd: 60000, addonVouchers: [] }
      ],
      discountVouchers: [{ voucher_id: "discount-v1" }],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Should NOT call voucher.updateMany to redeem at COMPLETED
    // (vouchers were already redeemed at ADMIN_CONFIRMED)
    expect(mockVoucherUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REDEEMED" }),
      })
    );
  });

  it("Surplus aggregate: hai PRODUCT surplus 7k + 6k = 13k → floor(13k/10k) = 1 điểm", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 100000,
      grand_total_vnd: 100000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [
        { product_voucher_id: "pv-1", unit_price_vnd: 70000, productVoucher: { covered_price_vnd: 77000 }, addonVouchers: [] },
        { product_voucher_id: "pv-2", unit_price_vnd: 50000, productVoucher: { covered_price_vnd: 56000 }, addonVouchers: [] },
      ],
      discountVouchers: [],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Aggregate: 7k + 6k = 13k → floor(13k/10k) = 1 point
    const surplusLog = mockPointsLogCreate.mock.calls.find(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "voucher_surplus"
    );
    expect(surplusLog).toBeDefined();
    expect(surplusLog![0].data.delta).toBe(1);
  });

  it("Surplus tạo đúng 1 log voucher_surplus với voucher_id = null", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [
        { product_voucher_id: "pv-1", unit_price_vnd: 40000, productVoucher: { covered_price_vnd: 55000 }, addonVouchers: [] },
      ],
      discountVouchers: [],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });

    // Should create exactly ONE surplus log with voucher_id = null
    const surplusLogs = mockPointsLogCreate.mock.calls.filter(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "voucher_surplus"
    );
    expect(surplusLogs).toHaveLength(1);
    expect(surplusLogs[0][0].data.voucher_id).toBeNull();
  });

  it("COMPLETED lặp hoặc concurrent → guard ngăn cộng điểm lần hai", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    // Order already COMPLETED (points_earned already set)
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: 5, // Already awarded
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [],
      discountVouchers: [],
    });

    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });

    // Should NOT create any new points logs (already awarded)
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });

  it("returns CONFLICT and does not award points when a concurrent request wins the status claim", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [],
      discountVouchers: [],
    });
    mockOrderUpdateMany.mockResolvedValue({ count: 0 });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(409);
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });

  it("order_items.surplus_points để null cho đơn mới", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);

    mockOrderFindUnique.mockResolvedValue({
      id: ORDER_ID,
      status: "STAFF_DONE",
      order_type: "PICKUP",
      points_earned: null,
      user_id: USER_ID,
      total_vnd: 50000,
      grand_total_vnd: 50000,
      handled_by: null,
      freeship_voucher_id: null,
      items: [
        {
          product_voucher_id: "pv-1",
          unit_price_vnd: 40000,
          productVoucher: { covered_price_vnd: 55000 },
          addonVouchers: [],
        },
      ],
      discountVouchers: [],
    });

    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockOrderUpdate.mockResolvedValue({ id: ORDER_ID, status: "COMPLETED" });

    const res = await PATCH(makeReq({ status: "COMPLETED" }), { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);

    // Should calculate surplus from covered_price_vnd - unit_price_vnd.
    // surplus = max(55000 - 40000, 0) = 15000 → floor(15000/10000) = 1 point
    const surplusLog = mockPointsLogCreate.mock.calls.find(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "voucher_surplus"
    );
    expect(surplusLog).toBeDefined();
    expect(surplusLog![0].data.delta).toBe(1);
  });
});
