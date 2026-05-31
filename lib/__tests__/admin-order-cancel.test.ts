/**
 * Tests cho logic hủy đơn hàng — bao phủ toàn bộ yêu cầu:
 *
 * 1. Hệ thống tự động hủy đơn quá 20 phút (lazy cancel trên GET list)
 * 2. Admin hủy được đơn COUNTER đã COMPLETED (staff bấm nhầm / khách đổi ý)
 *    → phải trừ lại điểm order_complete, floor về 0 không cho âm
 * 3. Admin hủy được đơn online chưa complete (PENDING, ADMIN_CONFIRMED, STAFF_DONE)
 * 4. Admin KHÔNG hủy được đơn online đã COMPLETED
 * 5. Staff KHÔNG hủy được đơn nào
 * 6. Restore voucher về ACTIVE khi hủy
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock declarations (phải đứng trước dynamic import) ───────────────────────

const mockGetSession = vi.fn();

// Staff/orders/[id] route mocks
const mockOrderFindUniqueStaff = vi.fn();
const mockOrderUpdateStaff = vi.fn();
const mockOrderItemFindManyStaff = vi.fn();
const mockVoucherFindUniqueStaff = vi.fn();
const mockVoucherUpdateStaff = vi.fn();
const mockUserFindUniqueStaff = vi.fn();
const mockUserUpdateStaff = vi.fn();
const mockPointsLogFindManyStaff = vi.fn();
const mockPointsLogCreateStaff = vi.fn();
const mockOrderDiscountVoucherFindManyStaff = vi.fn();
const mockTransactionStaff = vi.fn();

// Orders route mocks (customer GET)
const mockOrderFindManyCustomer = vi.fn();
const mockOrderCountCustomer = vi.fn();
const mockTransactionCustomer = vi.fn();
const mockOrderFindUniqueCustomer = vi.fn();
const mockOrderUpdateCustomer = vi.fn();
const mockOrderItemFindManyCustomer = vi.fn();
const mockVoucherFindUniqueCustomer = vi.fn();
const mockVoucherUpdateCustomer = vi.fn();
const mockUserUpdateCustomer = vi.fn();
const mockPointsLogFindManyCustomer = vi.fn();
const mockOrderDiscountVoucherFindManyCustomer = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  normalizePhone: (p: string) => p,
}));

vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: vi.fn().mockReturnValue("https://example.com/qr"),
}));

vi.mock("@/lib/logger", () => ({
  logSystemEvent: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStaffPatchReq(body: unknown, orderId = "order-uuid-1") {
  return new NextRequest(`http://localhost/api/staff/orders/${orderId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCustomerGetReq(): NextRequest {
  return new NextRequest("http://localhost/api/orders", { method: "GET" });
}

const ADMIN_SESSION  = { id: "admin-uuid-1", role: "ADMIN",  phone_number: "+84900000001" };
const STAFF_SESSION  = { id: "staff-uuid-1", role: "STAFF",  phone_number: "+84900000002" };
const USER_ID        = "user-uuid-1";

/** Tạo mock tx object dùng chung cho staff orders route */
function makeStaffTx() {
  return {
    order: {
      findUnique: mockOrderFindUniqueStaff,
      update:     mockOrderUpdateStaff,
    },
    voucher: {
      findUnique: mockVoucherFindUniqueStaff,
      update:     mockVoucherUpdateStaff,
    },
    orderItem: {
      findMany: mockOrderItemFindManyStaff,
    },
    user: {
      findUnique: mockUserFindUniqueStaff,
      update:     mockUserUpdateStaff,
    },
    pointsLog: {
      findMany: mockPointsLogFindManyStaff,
      create:   mockPointsLogCreateStaff,
    },
    orderDiscountVoucher: {
      findMany: mockOrderDiscountVoucherFindManyStaff,
    },
  };
}

// ── Test Suite 1: PATCH /api/staff/orders/[id] ───────────────────────────────

describe("PATCH /api/staff/orders/[id] — cancel rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default tx mock: executes callback
    mockTransactionStaff.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(makeStaffTx())
    );

    // Default: no vouchers, no points logs
    mockOrderDiscountVoucherFindManyStaff.mockResolvedValue([]);
    mockOrderItemFindManyStaff.mockResolvedValue([]);
    mockPointsLogFindManyStaff.mockResolvedValue([]);
    mockUserFindUniqueStaff.mockResolvedValue({ points_balance: 10 });
  });

  // Dynamic import sau khi mock đã đăng ký
  async function getPATCH() {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        order:  { findUnique: mockOrderFindUniqueStaff, update: mockOrderUpdateStaff },
        $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransactionStaff(fn),
      },
    }));
    const mod = await import("@/app/api/staff/orders/[id]/route");
    return mod.PATCH;
  }

  // ── 5. Staff KHÔNG hủy được ──────────────────────────────────────────────

  it("5a. Staff cố hủy đơn PENDING → 400 INVALID_TRANSITION", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "PENDING",
      order_type: "COUNTER",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 50000,
      handled_by: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_TRANSITION");
    expect(json.error).toContain("Only ADMIN");
  });

  it("5b. Staff cố hủy đơn ADMIN_CONFIRMED → 400 INVALID_TRANSITION", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "ADMIN_CONFIRMED",
      order_type: "PICKUP",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 50000,
      handled_by: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_TRANSITION");
    expect(json.error).toContain("Only ADMIN");
  });

  // ── 3. Admin hủy được đơn online chưa complete ───────────────────────────

  it("3a. Admin hủy đơn PENDING (PICKUP) → 200 CANCELLED", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "PENDING",
      order_type: "PICKUP",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 50000,
      handled_by: null,
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "CANCELLED",
      user: null,
      handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockOrderUpdateStaff).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) })
    );
    // Đơn chưa COMPLETED → không reverse order_complete points
    expect(mockPointsLogFindManyStaff).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reason: "order_complete" }) })
    );
  });

  it("3b. Admin hủy đơn ADMIN_CONFIRMED (DELIVERY) → 200 CANCELLED", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "ADMIN_CONFIRMED",
      order_type: "DELIVERY",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 80000,
      handled_by: null,
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
  });

  it("3c. Admin hủy đơn STAFF_DONE (PICKUP) → 200 CANCELLED", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "STAFF_DONE",
      order_type: "PICKUP",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 60000,
      handled_by: "staff-uuid-1",
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
  });

  // ── 4. Admin KHÔNG hủy được đơn online đã COMPLETED ─────────────────────

  it("4. Admin cố hủy đơn PICKUP đã COMPLETED → 400 INVALID_TRANSITION", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "COMPLETED",
      order_type: "PICKUP",
      user_id: USER_ID,
      items: [],
      points_earned: 5,
      total_vnd: 50000,
      handled_by: "staff-uuid-1",
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_TRANSITION");
    expect(json.error).toContain("Completed online orders cannot be cancelled");
  });

  // ── 2. Admin hủy đơn COUNTER đã COMPLETED → reverse points ──────────────

  it("2a. Admin hủy COUNTER COMPLETED → order status = CANCELLED, points_earned = 0", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "COMPLETED",
      order_type: "COUNTER",
      user_id: USER_ID,
      items: [],
      points_earned: 5,
      total_vnd: 55000,
      handled_by: "staff-uuid-1",
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
    // points_earned phải được set về 0
    expect(mockOrderUpdateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED", points_earned: 0 }),
      })
    );
  });

  it("2b. Admin hủy COUNTER COMPLETED → tìm order_complete log để reverse", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "COMPLETED",
      order_type: "COUNTER",
      user_id: USER_ID,
      items: [],
      points_earned: 5,
      total_vnd: 55000,
      handled_by: "staff-uuid-1",
    });

    // Có 1 order_complete log với delta = 5
    mockPointsLogFindManyStaff.mockImplementation(({ where }: { where: { reason?: string } }) => {
      if (where?.reason === "order_complete") {
        return Promise.resolve([{ id: "log-1", user_id: USER_ID, delta: 5 }]);
      }
      return Promise.resolve([]);
    });

    mockUserFindUniqueStaff.mockResolvedValue({ points_balance: 10 });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);

    // Phải trừ điểm user
    expect(mockUserUpdateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { points_balance: { decrement: 5 } },
      })
    );

    // Phải insert points_log row âm với reason order_complete_reversed
    expect(mockPointsLogCreateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: USER_ID,
          delta: -5,
          reason: "order_complete_reversed",
          reversed_log_id: "log-1",
          performed_by: ADMIN_SESSION.id,
        }),
      })
    );
  });

  it("2c. Points balance không bao giờ âm: khách chỉ còn 3 điểm nhưng cần trừ 5 → floor về 0", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "COMPLETED",
      order_type: "COUNTER",
      user_id: USER_ID,
      items: [],
      points_earned: 5,
      total_vnd: 55000,
      handled_by: "staff-uuid-1",
    });

    // Khách chỉ còn 3 điểm (đã tiêu bớt sau khi hoàn thành đơn)
    mockUserFindUniqueStaff.mockResolvedValue({ points_balance: 3 });
    mockPointsLogFindManyStaff.mockImplementation(({ where }: { where: { reason?: string } }) => {
      if (where?.reason === "order_complete") {
        return Promise.resolve([{ id: "log-1", user_id: USER_ID, delta: 5 }]);
      }
      return Promise.resolve([]);
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    // actualDecrement = min(5, 3) = 3 → không trừ quá balance hiện tại
    expect(mockUserUpdateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { points_balance: { decrement: 3 } }, // chỉ trừ 3, không phải 5
      })
    );

    // Log âm phản ánh số thực sự trừ được
    expect(mockPointsLogCreateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delta: -3 }),
      })
    );
  });

  it("2d. Admin hủy COUNTER COMPLETED không có order_complete log → không lỗi", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "COMPLETED",
      order_type: "COUNTER",
      user_id: null, // anonymous order
      items: [],
      points_earned: 0,
      total_vnd: 55000,
      handled_by: "staff-uuid-1",
    });
    // Không có points log (anonymous order)
    mockPointsLogFindManyStaff.mockResolvedValue([]);
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockUserUpdateStaff).not.toHaveBeenCalled(); // anonymous, no user
    expect(mockPointsLogCreateStaff).not.toHaveBeenCalled();
  });

  // ── 6. Restore voucher ────────────────────────────────────────────────────

  it("6. Admin hủy đơn có DISCOUNT voucher RESERVED → voucher restore về ACTIVE", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockOrderFindUniqueStaff.mockResolvedValue({
      id: "order-uuid-1",
      status: "PENDING",
      order_type: "PICKUP",
      user_id: USER_ID,
      items: [],
      points_earned: null,
      total_vnd: 50000,
      handled_by: null,
    });
    mockOrderUpdateStaff.mockResolvedValue({
      id: "order-uuid-1", status: "CANCELLED", user: null, handler: null,
    });

    // Có 1 DISCOUNT voucher RESERVED
    mockOrderDiscountVoucherFindManyStaff.mockResolvedValue([{ voucher_id: "voucher-1" }]);
    mockVoucherFindUniqueStaff.mockResolvedValue({ status: "RESERVED" });

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "order-uuid-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockVoucherUpdateStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "voucher-1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });

  // ── Misc: đơn không tồn tại ──────────────────────────────────────────────

  it("Admin cố hủy đơn không tồn tại → 404", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockTransactionStaff.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = makeStaffTx();
        mockOrderFindUniqueStaff.mockResolvedValue(null); // not found
        return fn(tx);
      }
    );

    const PATCH = await getPATCH();
    const res = await PATCH(makeStaffPatchReq({ status: "CANCELLED" }), {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("NOT_FOUND");
  });
});

// ── Test Suite 2: GET /api/orders — Lazy auto-cancel ─────────────────────────

describe("GET /api/orders — lazy auto-cancel đơn quá 20 phút", () => {
  const CUSTOMER_SESSION = { id: USER_ID, role: "CUSTOMER", phone_number: "+84900000003" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
  });

  async function getGET() {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        order: {
          findUnique: mockOrderFindUniqueCustomer,
          findMany:   mockOrderFindManyCustomer,
          count:      mockOrderCountCustomer,
          update:     mockOrderUpdateCustomer,
        },
        $transaction: (arg: unknown) => mockTransactionCustomer(arg),
      },
    }));
    const mod = await import("@/app/api/orders/route");
    return mod.GET;
  }

  it("1a. Đơn PENDING chưa hết hạn → không bị cancel", async () => {
    const futureDeadline = new Date(Date.now() + 10 * 60 * 1000); // còn 10 phút
    const pendingOrder = {
      id: "order-active",
      status: "PENDING",
      order_type: "PICKUP",
      user_id: USER_ID,
      auto_cancel_at: futureDeadline,
      order_code: "BCBM-001",
      total_vnd: 50000,
    };

    // $transaction trả [count, orders]
    mockTransactionCustomer.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)({
        order: {
          findUnique: mockOrderFindUniqueCustomer,
          update: mockOrderUpdateCustomer,
        },
        voucher: { findUnique: vi.fn(), update: vi.fn() },
        orderItem: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findUnique: vi.fn(), update: vi.fn() },
        pointsLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        orderDiscountVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      });
    });
    mockOrderCountCustomer.mockResolvedValue(1);
    mockOrderFindManyCustomer.mockResolvedValue([pendingOrder]);

    const GET = await getGET();
    const res = await GET(makeCustomerGetReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    // Status vẫn PENDING, không bị cancel
    expect(json.data[0].status).toBe("PENDING");
    expect(mockOrderUpdateCustomer).not.toHaveBeenCalled();
  });

  it("1b. Đơn PENDING đã quá hạn → bị lazy cancel, response trả về CANCELLED", async () => {
    const pastDeadline = new Date(Date.now() - 5 * 60 * 1000); // đã qua 5 phút
    const expiredOrder = {
      id: "order-expired",
      status: "PENDING",
      order_type: "PICKUP",
      user_id: USER_ID,
      auto_cancel_at: pastDeadline,
      order_code: "BCBM-002",
      total_vnd: 50000,
    };

    mockOrderCountCustomer.mockResolvedValue(1);
    mockOrderFindManyCustomer.mockResolvedValue([expiredOrder]);

    // Transaction cho lazy cancel: re-check status vẫn PENDING → cho phép cancel
    mockOrderFindUniqueCustomer.mockResolvedValue({ status: "PENDING" });
    mockOrderUpdateCustomer.mockResolvedValue({ id: "order-expired", status: "CANCELLED" });

    mockTransactionCustomer.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)({
        order: {
          findUnique: mockOrderFindUniqueCustomer,
          update: mockOrderUpdateCustomer,
        },
        voucher: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        orderItem: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findUnique: vi.fn().mockResolvedValue({ points_balance: 0 }), update: vi.fn() },
        pointsLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        orderDiscountVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      });
    });

    const GET = await getGET();
    const res = await GET(makeCustomerGetReq());

    expect(res.status).toBe(200);
    const json = await res.json();
    // Response trả về status đã được update in-memory
    expect(json.data[0].status).toBe("CANCELLED");
    // Đã gọi update để cancel
    expect(mockOrderUpdateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-expired" },
        data: { status: "CANCELLED" },
      })
    );
  });

  it("1c. Race condition: đơn đã bị cancel bởi request khác → skip silently", async () => {
    const pastDeadline = new Date(Date.now() - 5 * 60 * 1000);
    const expiredOrder = {
      id: "order-race",
      status: "PENDING",
      order_type: "PICKUP",
      user_id: USER_ID,
      auto_cancel_at: pastDeadline,
      order_code: "BCBM-003",
      total_vnd: 50000,
    };

    mockOrderCountCustomer.mockResolvedValue(1);
    mockOrderFindManyCustomer.mockResolvedValue([expiredOrder]);

    // Re-check trong transaction: đã bị cancel bởi request khác
    mockOrderFindUniqueCustomer.mockResolvedValue({ status: "CANCELLED" }); // đã cancel rồi

    mockTransactionCustomer.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return (arg as (tx: unknown) => Promise<unknown>)({
        order: {
          findUnique: mockOrderFindUniqueCustomer,
          update: mockOrderUpdateCustomer,
        },
        voucher: { findUnique: vi.fn(), update: vi.fn() },
        orderItem: { findMany: vi.fn().mockResolvedValue([]) },
        user: { findUnique: vi.fn(), update: vi.fn() },
        pointsLog: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        orderDiscountVoucher: { findMany: vi.fn().mockResolvedValue([]) },
      });
    });

    const GET = await getGET();
    const res = await GET(makeCustomerGetReq());

    // Không throw, không update lần thứ 2
    expect(res.status).toBe(200);
    expect(mockOrderUpdateCustomer).not.toHaveBeenCalled();
  });

  it("1d. Đơn COMPLETED không bị ảnh hưởng bởi lazy cancel", async () => {
    const completedOrder = {
      id: "order-completed",
      status: "COMPLETED",
      order_type: "COUNTER",
      user_id: USER_ID,
      auto_cancel_at: null, // COUNTER không có deadline
      total_vnd: 50000,
    };

    mockOrderCountCustomer.mockResolvedValue(1);
    mockOrderFindManyCustomer.mockResolvedValue([completedOrder]);

    mockTransactionCustomer.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg;
    });

    const GET = await getGET();
    const res = await GET(makeCustomerGetReq());

    expect(res.status).toBe(200);
    expect(mockOrderUpdateCustomer).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.data[0].status).toBe("COMPLETED");
  });
});
