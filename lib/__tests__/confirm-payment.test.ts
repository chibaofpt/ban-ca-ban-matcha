/**
 * Unit tests for PATCH /api/admin/orders/[id]/confirm-payment
 * Focused on: push notification trigger behavior.
 *
 * Strategy: mock lib/push to verify sendPushToRoles is called correctly.
 * Tests FAIL until after() + sendPushToRoles integration is implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared before imports ────────────────────────────────────────────

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

const mockSendPushToRoles = vi.fn();

vi.mock("@/lib/push", () => ({
  sendPushToRoles: (...args: unknown[]) => mockSendPushToRoles(...args),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void) => fn(),
  };
});
const mockOrderFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockOrderFindUniqueOrThrow = vi.fn();
const mockOrderDiscountVoucherFindMany = vi.fn();
const mockOrderItemFindMany = vi.fn();
const mockOrderItemAddonVoucherFindMany = vi.fn();
const mockOrderBundleApplicationFindMany = vi.fn();
const mockOrderBundleApplicationUpdateMany = vi.fn();
const mockVoucherUpdate = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("@/lib/cancelOrder", () => ({
  restoreVouchersOnCancel: vi.fn(),
}));

// ── Import AFTER mocks ───────────────────────────────────────────────────────
import { PATCH } from "@/app/api/admin/orders/[id]/confirm-payment/route";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = "550e8400-e29b-41d4-a716-446655440001";
const ORDER_ID = "550e8400-e29b-41d4-a716-446655440002";

const adminSession = { id: ADMIN_ID, role: "ADMIN" };

const pendingOrder = {
  id: ORDER_ID,
  status: "PENDING",
  order_type: "PICKUP",
  auto_cancel_at: new Date(Date.now() + 20 * 60 * 1000), // 20 phút nữa
  order_code: "BCBM-A3X7K2",
};

const updatedOrder = {
  ...pendingOrder,
  status: "ADMIN_CONFIRMED",
  payment_confirmed_at: new Date(),
  payment_confirmed_by: ADMIN_ID,
  user: { name: "Nguyễn Văn A", phone_number: "+84901234567" },
};

function makeReq(orderId = ORDER_ID): NextRequest {
  return new NextRequest(`http://localhost/api/admin/orders/${orderId}/confirm-payment`, {
    method: "PATCH",
  });
}

function setupSuccessfulConfirmation() {
  mockOrderFindUnique.mockResolvedValue(pendingOrder);

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      order: {
        update: mockOrderUpdate.mockResolvedValue(updatedOrder),
        updateMany: mockOrderUpdateMany.mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: mockOrderFindUniqueOrThrow.mockResolvedValue(updatedOrder),
      },
      orderDiscountVoucher: {
        findMany: mockOrderDiscountVoucherFindMany.mockResolvedValue([]),
      },
      orderItem: {
        findMany: mockOrderItemFindMany.mockResolvedValue([]),
      },
      orderItemAddonVoucher: {
        findMany: mockOrderItemAddonVoucherFindMany.mockResolvedValue([]),
      },
      orderBundleApplication: {
        findMany: mockOrderBundleApplicationFindMany.mockResolvedValue([]),
        updateMany: mockOrderBundleApplicationUpdateMany.mockResolvedValue({ count: 0 }),
      },
      voucher: {
        update: mockVoucherUpdate,
        updateMany: mockVoucherUpdateMany.mockResolvedValue({ count: 0 }),
      },
    };
    return fn(tx);
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/orders/[id]/confirm-payment — push notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockSendPushToRoles.mockResolvedValue(undefined);
  });

  it("gọi sendPushToRoles với ['STAFF', 'ADMIN'] và excludeUserId = admin.id sau khi confirm thành công", async () => {
    setupSuccessfulConfirmation();

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(200);

    // Verify push was triggered with correct args
    expect(mockSendPushToRoles).toHaveBeenCalledWith(
      expect.arrayContaining(["STAFF", "ADMIN"]),
      expect.objectContaining({
        title: expect.stringContaining("xác nhận"),
        url: "/staff/orders",
      }),
      ADMIN_ID // excludeUserId — admin không nhận push của chính mình
    );
  });

  it("payload push chứa order_code trong body", async () => {
    setupSuccessfulConfirmation();

    await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(mockSendPushToRoles).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        body: expect.stringContaining("BCBM-A3X7K2"),
      }),
      ADMIN_ID
    );
  });

  it("không gọi sendPushToRoles khi order không phải PENDING", async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...pendingOrder,
      status: "ADMIN_CONFIRMED", // đã confirm rồi
    });

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(422);
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });

  it("không gọi sendPushToRoles khi order đã expired (auto-cancel window)", async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...pendingOrder,
      auto_cancel_at: new Date(Date.now() - 1000), // đã quá hạn
    });

    // Transaction sẽ cancel order
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
      order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      return fn(tx);
    });

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(422);
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });

  it("không gọi sendPushToRoles khi order không tồn tại", async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(404);
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });

  it("push failure không ảnh hưởng response — vẫn trả 200", async () => {
    setupSuccessfulConfirmation();
    mockSendPushToRoles.mockRejectedValue(new Error("Push service down"));

    // Dù push fail, response vẫn phải 200
    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(200);
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(401);
    expect(mockSendPushToRoles).not.toHaveBeenCalled();
  });
});
// ── Voucher lifecycle tại ADMIN_CONFIRMED ──────────────────────────────────

const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();

const PRODUCT_VOUCHER_ID = "product-v1";
const DISCOUNT_VOUCHER_ID = "discount-v1";
const FREESHIP_VOUCHER_ID = "freeship-v1";
const ADDON_VOUCHER_ID = "addon-v1";

const pendingOrderWithVouchers = {
  id: ORDER_ID,
  status: "PENDING",
  order_type: "PICKUP",
  auto_cancel_at: new Date(Date.now() + 20 * 60 * 1000),
  order_code: "BCBM-V1TEST",
  freeship_voucher_id: FREESHIP_VOUCHER_ID,
  user_id: "user-001",
};

function setupVoucherConfirmation(opts?: { updateManyCount?: number }) {
  mockOrderFindUnique.mockResolvedValue(pendingOrderWithVouchers);

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      order: {
        update: mockOrderUpdate.mockResolvedValue({
          ...pendingOrderWithVouchers,
          status: "ADMIN_CONFIRMED",
          payment_confirmed_at: new Date(),
          payment_confirmed_by: ADMIN_ID,
          user: { name: "Test User", phone_number: "+84901234567" },
          user_id: "user-001",
        }),
        updateMany: mockOrderUpdateMany.mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: mockOrderFindUniqueOrThrow.mockResolvedValue({
          ...pendingOrderWithVouchers,
          status: "ADMIN_CONFIRMED",
          payment_confirmed_at: new Date(),
          payment_confirmed_by: ADMIN_ID,
          user: { name: "Test User", phone_number: "+84901234567" },
          user_id: "user-001",
        }),
      },
      orderDiscountVoucher: {
        findMany: mockOrderDiscountVoucherFindMany.mockResolvedValue([
          { voucher_id: DISCOUNT_VOUCHER_ID },
        ]),
      },
      orderItem: {
        findMany: mockOrderItemFindMany.mockResolvedValue([
          { product_voucher_id: PRODUCT_VOUCHER_ID, unit_price_vnd: 70000 },
        ]),
      },
      orderItemAddonVoucher: {
        findMany: mockOrderItemAddonVoucherFindMany.mockResolvedValue([
          { voucher_id: ADDON_VOUCHER_ID },
        ]),
      },
      orderBundleApplication: {
        findMany: mockOrderBundleApplicationFindMany.mockResolvedValue([]),
        updateMany: mockOrderBundleApplicationUpdateMany.mockResolvedValue({ count: 0 }),
      },
      voucher: {
        update: mockVoucherUpdate,
        updateMany: mockVoucherUpdateMany.mockResolvedValue({
          count: opts?.updateManyCount ?? 4,
        }),
      },
      user: { update: mockUserUpdate, findUnique: vi.fn() },
      pointsLog: { create: mockPointsLogCreate },
    };
    return fn(tx);
  });
}

describe("PATCH /api/admin/orders/[id]/confirm-payment — voucher lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession);
    mockSendPushToRoles.mockResolvedValue(undefined);
  });

  it("Chuyển PENDING → ADMIN_CONFIRMED và redeem tất cả voucher RESERVED → REDEEMED", async () => {
    setupVoucherConfirmation();

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(200);

    // Should use updateMany with status: "RESERVED" condition (conditional update)
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "RESERVED",
        }),
        data: expect.objectContaining({
          status: "REDEEMED",
          used_channel: "ONLINE",
        }),
      })
    );
  });

  it("Không cộng order_complete hoặc voucher_surplus points tại ADMIN_CONFIRMED", async () => {
    setupVoucherConfirmation();

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(200);

    // No pointsLog should be created at ADMIN_CONFIRMED
    const pointsCalls = mockPointsLogCreate.mock.calls;
    const surplusLog = pointsCalls.find(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "voucher_surplus"
    );
    const orderCompleteLog = pointsCalls.find(
      (c: Array<{ data: { reason: string } }>) => c[0]?.data?.reason === "order_complete"
    );
    expect(surplusLog).toBeUndefined();
    expect(orderCompleteLog).toBeUndefined();

    // No user.update for points increment
    const userUpdateCalls = mockUserUpdate.mock.calls;
    const pointsIncrement = userUpdateCalls.find(
      (c: Array<{ data: { points_balance: { increment: number } } }>) =>
        c[0]?.data?.points_balance?.increment !== undefined
    );
    expect(pointsIncrement).toBeUndefined();
  });

  it("Dùng conditional update (updateMany with status RESERVED) — voucher đã REDEEMED thì count = 0 → rollback", async () => {
    // Simulate: updateMany returns count = 0 (all vouchers already redeemed)
    setupVoucherConfirmation({ updateManyCount: 0 });

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    // Should rollback/error because count mismatch
    // Exact status code depends on implementation — likely 422 or 500
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("Gọi lặp lại khi đã ADMIN_CONFIRMED → trả INVALID_STATUS, không redeem lần hai", async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...pendingOrderWithVouchers,
      status: "ADMIN_CONFIRMED", // already confirmed
    });

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("INVALID_STATUS");
  });

  it("COUNTER order bị từ chối confirm-payment → trả INVALID_ORDER_TYPE", async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...pendingOrderWithVouchers,
      order_type: "COUNTER",
    });

    const res = await PATCH(makeReq(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("INVALID_ORDER_TYPE");
  });
});
