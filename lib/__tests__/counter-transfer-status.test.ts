import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderUpdateMany = vi.fn();
const mockOrderUpdate = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockBundleApplicationUpdateMany = vi.fn();
const mockUserUpdate = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockRestoreVouchersOnCancel = vi.fn();
const mockDirectOrderFindUnique = vi.fn();
const mockBuildVietQRUrl = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/cancelOrder", () => ({
  restoreVouchersOnCancel: (...args: unknown[]) => mockRestoreVouchersOnCancel(...args),
}));
vi.mock("@/lib/vietqr", () => ({
  buildVietQRUrl: (...args: unknown[]) => mockBuildVietQRUrl(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(), order: { findUnique: (...args: unknown[]) => mockDirectOrderFindUnique(...args) } },
}));

import { GET, PATCH } from "@/app/api/staff/orders/[id]/route";
import { prisma } from "@/lib/prisma";

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "550e8400-e29b-41d4-a716-446655440002";
const CREATOR_ID = "550e8400-e29b-41d4-a716-446655440003";
const OTHER_STAFF_ID = "550e8400-e29b-41d4-a716-446655440004";
const ADMIN_ID = "550e8400-e29b-41d4-a716-446655440005";

function makeRequest(status: "COMPLETED" | "CANCELLED"): NextRequest {
  return new NextRequest(`http://localhost/api/staff/orders/${ORDER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/staff/orders/${ORDER_ID}`);
}

function pendingTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    status: "PENDING",
    order_type: "COUNTER",
    payment_method: "BANK_TRANSFER",
    order_code: "BCBM-PAY001",
    auto_cancel_at: new Date(Date.now() + 10 * 60 * 1000),
    handled_by: CREATOR_ID,
    user_id: USER_ID,
    points_earned: null,
    total_vnd: 69_000,
    grand_total_vnd: 69_000,
    freeship_voucher_id: null,
    discountVouchers: [{ voucher_id: "discount-v1" }],
    items: [
      {
        product_voucher_id: "product-v1",
        unit_price_vnd: 50_000,
        productVoucher: { covered_price_vnd: 50_000 },
        addonVouchers: [{ voucher_id: "addon-v1" }],
      },
    ],
    ...overrides,
  };
}

function setupTransaction(): void {
  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        order: {
          findUnique: mockOrderFindUnique,
          updateMany: mockOrderUpdateMany,
          update: mockOrderUpdate,
        },
        voucher: { updateMany: mockVoucherUpdateMany },
        orderBundleApplication: { updateMany: mockBundleApplicationUpdateMany },
        user: { update: mockUserUpdate },
        pointsLog: { create: mockPointsLogCreate },
      }),
  );
}

describe("PATCH /api/staff/orders/[id] — chuyển khoản tại quầy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    mockOrderFindUnique.mockResolvedValue(pendingTransfer());
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });
    mockVoucherUpdateMany.mockResolvedValue({ count: 3 });
    mockUserUpdate.mockResolvedValue({});
    mockPointsLogCreate.mockResolvedValue({});
    mockBundleApplicationUpdateMany.mockResolvedValue({ count: 1 });
    mockOrderUpdate.mockResolvedValue({
      id: ORDER_ID,
      status: "COMPLETED",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      user: null,
      handler: null,
    });
  });

  it("Staff tạo đơn được xác nhận PENDING thành COMPLETED", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        id: ORDER_ID,
        status: "COMPLETED",
        payment_method: "BANK_TRANSFER",
        payment_qr_url: null,
        skipped_vouchers: [],
      },
    });
    expect(mockOrderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ORDER_ID, status: "PENDING" }),
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "RESERVED" }),
        data: expect.objectContaining({ used_channel: "OFFLINE" }),
      }),
    );
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payment_confirmed_by: CREATOR_ID,
          payment_confirmed_at: expect.any(Date),
          points_earned: 6,
        }),
      }),
    );
  });

  it("xác nhận chuyển khoản redeem BUNDLE và application trong cùng transaction", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });
    mockOrderFindUnique.mockResolvedValue(pendingTransfer({
      bundleApplications: [{ voucher_id: "bundle-v1", status: "RESERVED" }],
    }));
    mockVoucherUpdateMany.mockResolvedValue({ count: 4 });

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { in: expect.arrayContaining(["bundle-v1"]) } }),
    }));
    expect(mockBundleApplicationUpdateMany).toHaveBeenCalledWith({
      where: { order_id: ORDER_ID, voucher_id: { in: ["bundle-v1"] }, status: "RESERVED" },
      data: { status: "REDEEMED" },
    });
  });

  it("Admin được xác nhận đơn của bất kỳ Staff nào", async () => {
    mockGetSession.mockResolvedValue({ id: ADMIN_ID, role: "ADMIN" });

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payment_confirmed_by: ADMIN_ID }),
      }),
    );
  });

  it("Staff khác không được xác nhận đơn không phải do mình tạo", async () => {
    mockGetSession.mockResolvedValue({ id: OTHER_STAFF_ID, role: "STAFF" });

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
    expect(mockOrderUpdateMany).not.toHaveBeenCalled();
  });

  it("không cho xác nhận đơn đã hết hạn", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });
    mockOrderFindUnique.mockResolvedValue(
      pendingTransfer({ auto_cancel_at: new Date(Date.now() - 1000) }),
    );

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("ORDER_EXPIRED");
    expect(mockVoucherUpdateMany).not.toHaveBeenCalled();
  });

  it("không mở transition mới cho COUNTER CASH", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });
    mockOrderFindUnique.mockResolvedValue(pendingTransfer({ payment_method: "CASH" }));

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_TRANSITION");
  });

  it("chặn double-spend khi request khác đã đổi trạng thái", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });
    mockOrderUpdateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(makeRequest("COMPLETED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("STATUS_CONFLICT");
    expect(mockVoucherUpdateMany).not.toHaveBeenCalled();
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
  });

  it("Staff tạo đơn được huỷ giao dịch chờ và trả voucher", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });
    mockOrderUpdate.mockResolvedValue({
      id: ORDER_ID,
      status: "CANCELLED",
      order_type: "COUNTER",
      payment_method: "BANK_TRANSFER",
      user: null,
      handler: null,
    });

    const response = await PATCH(makeRequest("CANCELLED"), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockRestoreVouchersOnCancel).toHaveBeenCalledWith(
      expect.anything(),
      ORDER_ID,
      expect.objectContaining({ reverseCompletionPoints: false, performedBy: CREATOR_ID }),
    );
  });
});

describe("GET /api/staff/orders/[id] — khôi phục chuyển khoản tại quầy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildVietQRUrl.mockReturnValue("https://img.vietqr.io/payment.jpg");
    mockDirectOrderFindUnique.mockResolvedValue(pendingTransfer());
  });

  it("Staff đọc lại đơn mình tạo và nhận VietQR", async () => {
    mockGetSession.mockResolvedValue({ id: CREATOR_ID, role: "STAFF" });

    const response = await GET(makeGetRequest(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        id: ORDER_ID,
        payment_method: "BANK_TRANSFER",
        payment_qr_url: "https://img.vietqr.io/payment.jpg",
      },
    });
  });

  it("Staff không đọc được đơn COUNTER của người khác", async () => {
    mockGetSession.mockResolvedValue({ id: OTHER_STAFF_ID, role: "STAFF" });

    const response = await GET(makeGetRequest(), {
      params: Promise.resolve({ id: ORDER_ID }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
  });
});
