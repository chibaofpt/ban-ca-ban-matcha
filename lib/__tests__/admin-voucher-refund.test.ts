import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), userFindFirst: vi.fn(), userFindUnique: vi.fn(), userUpdateMany: vi.fn(),
  userFindUniqueOrThrow: vi.fn(), voucherCount: vi.fn(), voucherFindMany: vi.fn(),
  voucherFindFirst: vi.fn(), voucherUpdateMany: vi.fn(), pointsFindMany: vi.fn(),
  pointsFindFirst: vi.fn(), pointsCreate: vi.fn(), orderFindFirst: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique,
    updateMany: mocks.userUpdateMany, findUniqueOrThrow: mocks.userFindUniqueOrThrow },
  voucher: { count: mocks.voucherCount, findMany: mocks.voucherFindMany,
    findFirst: mocks.voucherFindFirst, updateMany: mocks.voucherUpdateMany },
  pointsLog: { findMany: mocks.pointsFindMany, findFirst: mocks.pointsFindFirst, create: mocks.pointsCreate },
  order: { findFirst: mocks.orderFindFirst }, $transaction: mocks.transaction,
} }));

import { listAdminUserVouchers } from "@/lib/users/adminUserQueries";
import * as validation from "@/lib/validations/adminUser";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/admin/users/[userQrToken]/vouchers/refund/route";

const now = new Date("2026-10-11T08:00:00Z");
const userToken = "550e8400-e29b-41d4-a716-446655440000";
const voucherToken = "550e8400-e29b-41d4-a716-446655440001";
const voucher = { id: "voucher-id", user_id: "customer-id", qr_token: voucherToken,
  issued_via: "POINTS_EXCHANGE", status: "ACTIVE", expires_at: null,
  created_at: now, redeemed_at: null, package: { name: "Matcha", description: null, points_cost: 30 } };
const purchase = { id: "purchase-id", user_id: "customer-id", voucher_id: "voucher-id",
  delta: -20, reason: "voucher_purchase", order_id: null, reversed_log_id: null, performed_by: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.session.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
  mocks.transaction.mockImplementation(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    operation(prisma as unknown as Prisma.TransactionClient));
  mocks.userFindFirst.mockResolvedValue({ id: "customer-id", points_balance: 50 });
  mocks.userFindUnique.mockResolvedValue({ role: "CUSTOMER", is_blocked: false, sourceMerge: null });
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userFindUniqueOrThrow.mockResolvedValue({ points_balance: 70 });
  mocks.voucherCount.mockResolvedValue(1);
  mocks.voucherFindMany.mockResolvedValue([voucher]);
  mocks.voucherFindFirst.mockResolvedValue(voucher);
  mocks.voucherUpdateMany.mockResolvedValue({ count: 1 });
  mocks.pointsFindMany.mockResolvedValue([purchase]);
  mocks.pointsFindFirst.mockResolvedValue(null);
  mocks.orderFindFirst.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); });

describe("hoàn voucher Admin — APPLICATION_LOGIC", () => {
  it("ví trả chi phí mua 20 điểm dù giá package hiện tại là 30", async () => {
    const page = await listAdminUserVouchers(userToken, 1, now);
    expect(page?.items[0]).toMatchObject({ can_refund: true, refundable_points: 20 });
  });
  it("công bố schema JSON hoàn voucher đóng", () => {
    expect(validation.adminUserVoucherRefundSchema.safeParse({ qr_token: voucherToken }).success).toBe(true);
    for (const input of [null, {}, { qr_token: "internal-id" }, { qr_token: voucherToken, points: 30 }, { voucher_id: voucherToken }]) {
      expect(validation.adminUserVoucherRefundSchema.safeParse(input).success).toBe(false);
    }
  });
});

async function refund(body: string = JSON.stringify({ qr_token: voucherToken }), token = userToken) {
  return POST(new NextRequest(`http://localhost/api/admin/users/${token}/vouchers/refund`, {
    method: "POST", body,
  }), { params: Promise.resolve({ userQrToken: token }) });
}

describe("route hoàn voucher Admin và workflow thật — APPLICATION_LOGIC", () => {
  it("hoàn 20 điểm từ audit, không phụ thuộc package 30 điểm hay live target", async () => {
    const response = await refund();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: {
      qr_token: voucherToken, status: "REFUNDED", points_refunded: 20, points_balance: 70,
    } });
    expect(mocks.pointsCreate).toHaveBeenCalledWith({ data: {
      user_id: "customer-id", voucher_id: "voucher-id", delta: 20,
      reason: "voucher_refund", performed_by: "admin-id", reversed_log_id: "purchase-id", order_id: null,
    } });
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { points_balance: { increment: 20 } },
    }));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    expect(mocks.voucherUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REFUNDED" } }));
  });

  it.each([null, "CUSTOMER", "STAFF"])("chặn role %s trước khi truy cập dữ liệu", async (role) => {
    mocks.session.mockResolvedValue(role ? { id: "other-id", role } : null);
    const response = await refund();
    expect(response.status).toBe(role ? 403 : 401);
    expect((await response.json()).code).toBe(role ? "FORBIDDEN" : "UNAUTHORIZED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "{}", JSON.stringify({ qr_token: voucherToken, points: 20 })])("JSON không hợp lệ trả 400: %s", async (body) => {
    expect((await refund(body)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("chỉ lookup QR public của khách và voucher thuộc khách; không fallback internal ID", async () => {
    mocks.voucherFindFirst.mockResolvedValue(null);
    const response = await refund();
    expect(response.status).toBe(404);
    expect(mocks.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { qr_token: userToken, role: "CUSTOMER", sourceMerge: { is: null } },
    }));
    expect(mocks.voucherFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { qr_token: voucherToken, user_id: "customer-id" },
    }));
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    mocks.userFindFirst.mockResolvedValue(null);
    expect((await refund()).status).toBe(404);
    expect((await refund(undefined, "internal-id")).status).toBe(404);
  });

  it("khách bị block vẫn được Admin hoàn tài chính, nhưng alias đã merge bị từ chối", async () => {
    mocks.userFindUnique.mockResolvedValue({ role: "CUSTOMER", is_blocked: true, sourceMerge: null });
    expect((await refund()).status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "customer-id", role: "CUSTOMER", sourceMerge: { is: null } },
    }));
    mocks.userFindUnique.mockResolvedValue({ role: "CUSTOMER", is_blocked: true, sourceMerge: { target_user_id: "canonical" } });
    const response = await refund();
    expect(response.status).toBe(409);
    expect((await response.json()).details.reason).toBe("ACCOUNT_NOT_ACTIVE");
  });

  it.each([
    ["ADMIN", "ACTIVE", null, 422, "VOUCHER_SOURCE_NOT_REFUNDABLE"],
    ["FREE_CLAIM", "ACTIVE", null, 422, "VOUCHER_SOURCE_NOT_REFUNDABLE"],
    ["AUTO_GRANT", "ACTIVE", null, 422, "VOUCHER_SOURCE_NOT_REFUNDABLE"],
    ["WELCOME_GIFT", "ACTIVE", null, 422, "VOUCHER_SOURCE_NOT_REFUNDABLE"],
    ["GACHA_REWARD", "ACTIVE", null, 422, "VOUCHER_SOURCE_NOT_REFUNDABLE"],
    ["POINTS_EXCHANGE", "RESERVED", null, 409, "VOUCHER_NOT_ACTIVE"],
    ["POINTS_EXCHANGE", "REDEEMED", null, 409, "VOUCHER_NOT_ACTIVE"],
    ["POINTS_EXCHANGE", "EXPIRED", null, 422, "VOUCHER_EXPIRED"],
    ["POINTS_EXCHANGE", "REFUNDED", null, 409, "VOUCHER_ALREADY_REFUNDED"],
    ["POINTS_EXCHANGE", "ACTIVE", now, 422, "VOUCHER_EXPIRED"],
    ["POINTS_EXCHANGE", "ACTIVE", new Date(now.getTime() - 1), 422, "VOUCHER_EXPIRED"],
  ] as const)("từ chối %s/%s và chiếu false/null ở ví", async (issuedVia, status, expiresAt, code, reason) => {
    const row = { ...voucher, issued_via: issuedVia, status, expires_at: expiresAt };
    mocks.voucherFindFirst.mockResolvedValue(row);
    mocks.voucherFindMany.mockResolvedValue([row]);
    const response = await refund();
    expect(response.status).toBe(code);
    expect(await response.json()).toMatchObject({ code: code === 409 ? "CONFLICT" : "BUSINESS_RULE_VIOLATION", details: { reason } });
    expect((await listAdminUserVouchers(userToken, 1, now))?.items[0]).toMatchObject({ can_refund: false, refundable_points: null });
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
  });

  it("cho phép expiry trong tương lai và kiểm tra biên tràn điểm nguyên", async () => {
    mocks.voucherFindFirst.mockResolvedValue({ ...voucher, expires_at: new Date(now.getTime() + 1) });
    mocks.userFindFirst.mockResolvedValue({ id: "customer-id", points_balance: 2_147_483_627 });
    mocks.userFindUniqueOrThrow.mockResolvedValue({ points_balance: 2_147_483_647 });
    expect((await refund()).status).toBe(200);
    mocks.userFindFirst.mockResolvedValue({ id: "customer-id", points_balance: 2_147_483_628 });
    const response = await refund();
    expect(response.status).toBe(422);
    expect((await response.json()).details.reason).toBe("POINTS_BALANCE_OVERFLOW");
    expect((await listAdminUserVouchers(userToken, 1, now))?.items[0]).toMatchObject({ can_refund: false, refundable_points: null });
  });

  it.each([
    [], [purchase, { ...purchase, id: "purchase-2" }], [{ ...purchase, delta: 0 }],
    [{ ...purchase, delta: 20 }], [{ ...purchase, delta: -1.5 }], [{ ...purchase, delta: -2_147_483_648 }],
    [{ ...purchase, user_id: "other-owner" }], [{ ...purchase, voucher_id: "other-voucher" }],
    [{ ...purchase, order_id: "an-order" }], [{ ...purchase, reversed_log_id: "old-log" }],
  ].map((logs) => [logs]))("audit thiếu, mâu thuẫn hoặc không phải debit nguyên bị fail closed %#", async (logs) => {
    mocks.pointsFindMany.mockResolvedValue(logs);
    const response = await refund();
    expect(response.status).toBe(422);
    expect((await response.json()).details.reason).toBe("VOUCHER_PURCHASE_AUDIT_INVALID");
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
  });

  it("purchase đã có reversal hoặc voucher có refund audit chặn hoàn lần nữa", async () => {
    mocks.pointsFindFirst.mockResolvedValue({ id: "refund-log" });
    const response = await refund();
    expect(response.status).toBe(422);
    expect((await response.json()).details.reason).toBe("VOUCHER_PURCHASE_ALREADY_REVERSED");
    expect(mocks.pointsFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [
      { reversed_log_id: "purchase-id" }, { voucher_id: "voucher-id", reason: "voucher_refund" },
    ] } }));
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
  });

  it("đơn đang dùng có thông báo dễ hiểu và reason tách riêng", async () => {
    mocks.orderFindFirst.mockResolvedValue({ id: "active-order" });
    const response = await refund();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "Voucher đang được dùng cho một đơn hàng, không thể hoàn điểm.",
      code: "CONFLICT", details: { reason: "VOUCHER_ORDER_CONFLICT" },
    });
  });
});

const linkCases = [
  { label: "FREESHIP", clause: { freeship_voucher_id: "voucher-id" } },
  { label: "DISCOUNT", clause: { discountVouchers: { some: { voucher_id: "voucher-id" } } } },
  { label: "PRODUCT", clause: { items: { some: { OR: expect.arrayContaining([{ product_voucher_id: "voucher-id" }]) } } } },
  { label: "PRODUCT_DISCOUNT", clause: { items: { some: { OR: expect.arrayContaining([{ product_voucher_id: "voucher-id" }]) } } } },
  { label: "ITEM", clause: { items: { some: { OR: expect.arrayContaining([{ item_voucher_id: "voucher-id" }]) } } } },
  { label: "ADDON", clause: { items: { some: { OR: expect.arrayContaining([{ addonVouchers: { some: { voucher_id: "voucher-id" } } }]) } } } },
  { label: "BUNDLE", clause: { bundleApplications: { some: { voucher_id: "voucher-id" } } } },
];

describe("mọi liên kết đơn dùng voucher — APPLICATION_LOGIC", () => {
  it.each(linkCases)("chặn $label ở đơn chưa CANCELLED nhưng cho phép lịch sử CANCELLED", async ({ clause }) => {
    let orderStatus = "PENDING";
    mocks.orderFindFirst.mockImplementation(async ({ where }: { where: Prisma.OrderWhereInput }) => {
      expect(where).toMatchObject({ status: { not: "CANCELLED" }, OR: expect.arrayContaining([expect.objectContaining(clause)]) });
      return orderStatus === "CANCELLED" ? null : { id: "linked-order" };
    });
    for (const status of ["PENDING", "ADMIN_CONFIRMED", "STAFF_DONE", "COMPLETED"]) {
      orderStatus = status;
      const response = await refund();
      expect(response.status).toBe(409);
      expect((await response.json()).details.reason).toBe("VOUCHER_ORDER_CONFLICT");
      expect((await listAdminUserVouchers(userToken, 1, now))?.items[0]).toMatchObject({ can_refund: false, refundable_points: null });
    }
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    orderStatus = "CANCELLED";
    expect((await refund()).status).toBe(200);
    expect((await listAdminUserVouchers(userToken, 1, now))?.items[0]).toMatchObject({ can_refund: true, refundable_points: 20 });
  });

  it("trang ví chỉ đọc page mười voucher, audit tối đa hai rows và existence select ID", async () => {
    const response = await listAdminUserVouchers(userToken, 2, now);
    expect(response?.items[0]).not.toHaveProperty("purchase_log_id");
    expect(response?.items[0]).not.toHaveProperty("id");
    expect(mocks.voucherFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(mocks.pointsFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true } }));
    expect(mocks.pointsFindFirst).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true } }));
  });
});

describe("kết quả tranh chấp được kiểm soát — SIMULATED_RACE_OUTCOME", () => {
  it("count 0 khi claim voucher trả 409 và không tăng điểm hay ghi refund log", async () => {
    mocks.voucherUpdateMany.mockResolvedValue({ count: 0 });
    const response = await refund();
    expect(response.status).toBe(409);
    expect((await response.json()).details.reason).toBe("VOUCHER_REFUND_CONFLICT");
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    expect(mocks.userFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("count 0 khi credit điểm trả 422 và không ghi audit thành công", async () => {
    mocks.userUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const response = await refund();
    expect(response.status).toBe(422);
    expect((await response.json()).details.reason).toBe("POINTS_BALANCE_OVERFLOW");
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
  });

  it("replay sau kết quả thắng đã lưu REFUNDED không nhận điểm lần hai", async () => {
    let status = "ACTIVE";
    mocks.voucherFindFirst.mockImplementation(async () => ({ ...voucher, status }));
    mocks.voucherUpdateMany.mockImplementation(async () => { status = "REFUNDED"; return { count: 1 }; });
    expect((await refund()).status).toBe(200);
    const replay = await refund();
    expect(replay.status).toBe(409);
    expect((await replay.json()).details.reason).toBe("VOUCHER_ALREADY_REFUNDED");
    expect(mocks.pointsCreate).toHaveBeenCalledTimes(1);
  });

  it("P2034 được thử lại có giới hạn, có thể thành công hoặc trả conflict khi hết lượt", async () => {
    const conflict = Object.assign(new Error("Controlled serialization result"), { code: "P2034" });
    mocks.transaction.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict);
    expect((await refund()).status).toBe(200);
    expect(mocks.pointsCreate).toHaveBeenCalledTimes(1);
    mocks.transaction.mockReset().mockRejectedValue(conflict);
    const response = await refund();
    expect(response.status).toBe(409);
    expect((await response.json()).details.reason).toBe("VOUCHER_REFUND_CONFLICT");
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
  });
});
