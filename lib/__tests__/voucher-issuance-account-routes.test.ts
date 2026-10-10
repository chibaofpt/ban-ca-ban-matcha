import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  recipient: vi.fn(),
  accountClaim: vi.fn(),
  accountRead: vi.fn(),
  packageRead: vi.fn(),
  voucherRead: vi.fn(),
  voucherCount: vi.fn(),
  voucherCreate: vi.fn(),
  pointsCreate: vi.fn(),
  grantCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/redis", () => ({
  getRedisClient: () => ({
    get: async () => null, incr: async () => 1, expire: async () => 1, ttl: async () => 60,
  }),
  cacheDelete: async () => undefined,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.recipient },
    $transaction: mocks.transaction,
  },
}));

import { POST as claim } from "@/app/api/profile/vouchers/claim/route";
import { POST as exchange } from "@/app/api/profile/vouchers/exchange/route";
import { POST as counterExchange } from "@/app/api/staff/users/[id]/vouchers/exchange/route";
import { POST as adminGrant } from "@/app/api/admin/voucher-packages/[id]/grants/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const USER_TOKEN = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";

function request(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routes = [
  { name: "khách nhận miễn phí", role: "CUSTOMER", mode: "FREE_CLAIM", invoke: () =>
    claim(request("/api/profile/vouchers/claim", { package_id: PACKAGE_ID })) },
  { name: "khách đổi điểm", role: "CUSTOMER", mode: "POINTS_EXCHANGE", invoke: () =>
    exchange(request("/api/profile/vouchers/exchange", { package_id: PACKAGE_ID })) },
  { name: "admin đổi điểm cho khách", role: "ADMIN", mode: "POINTS_EXCHANGE", invoke: () =>
    counterExchange(request(`/api/staff/users/${USER_TOKEN}/vouchers/exchange`, { package_id: PACKAGE_ID }),
      { params: Promise.resolve({ id: USER_TOKEN }) }) },
  { name: "admin tặng voucher", role: "ADMIN", mode: "NONE", invoke: () =>
    adminGrant(request(`/api/admin/voucher-packages/${PACKAGE_ID}/grants`,
      { user_qr_token: USER_TOKEN, request_id: REQUEST_ID }),
      { params: Promise.resolve({ id: PACKAGE_ID }) }) },
];

describe("Hợp đồng tài khoản đã ngừng hoạt động khi phát voucher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recipient.mockResolvedValue({ id: USER_ID, qr_token: USER_TOKEN, role: "CUSTOMER", sourceMerge: null });
    mocks.accountClaim.mockResolvedValue({ count: 0 });
    mocks.accountRead.mockResolvedValue({ role: "CUSTOMER", is_blocked: false, sourceMerge: null });
    mocks.voucherRead.mockResolvedValue(null);
    mocks.voucherCount.mockResolvedValue(0);
    mocks.packageRead.mockResolvedValue({
      id: PACKAGE_ID, name: "Quà", voucher_type: "DISCOUNT", acquisition_mode: "POINTS_EXCHANGE",
      visibility: "PUBLIC", points_cost: 10, is_active: true, quantity: null, max_per_user: 2,
      expires_after_days: null, ends_at: null,
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: { updateMany: mocks.accountClaim, findUnique: mocks.accountRead },
        voucherPackage: { findUnique: mocks.packageRead },
        voucher: { findUnique: mocks.voucherRead, count: mocks.voucherCount, create: mocks.voucherCreate },
        pointsLog: { create: mocks.pointsCreate },
        voucherGrant: { findUnique: mocks.voucherRead, create: mocks.grantCreate },
      }));
  });

  it.each(routes)("$name trả conflict khi claim tài khoản không còn hợp lệ", async (route) => {
    mocks.session.mockResolvedValue({ id: route.role === "ADMIN" ? ADMIN_ID : USER_ID, role: route.role });
    const response = await route.invoke();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Không thể hoàn tất yêu cầu tài khoản", code: "CONFLICT",
      details: { reason: "ACCOUNT_NOT_ACTIVE" },
    });
    expect(mocks.voucherCreate).not.toHaveBeenCalled();
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });

  it.each(routes)("$name trả conflict khi lần đọc xác nhận thấy tài khoản đã merge", async (route) => {
    mocks.session.mockResolvedValue({ id: route.role === "ADMIN" ? ADMIN_ID : USER_ID, role: route.role });
    mocks.accountClaim.mockResolvedValue({ count: 1 });
    mocks.accountRead.mockResolvedValue({
      role: "CUSTOMER", is_blocked: false, sourceMerge: { target_user_id: "canonical-customer" },
    });
    const response = await route.invoke();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONFLICT", details: { reason: "ACCOUNT_NOT_ACTIVE" } });
    expect(mocks.voucherCreate).not.toHaveBeenCalled();
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });

  it.each(routes)("$name vẫn trả lỗi package không tồn tại theo hợp đồng voucher", async (route) => {
    mocks.session.mockResolvedValue({ id: route.role === "ADMIN" ? ADMIN_ID : USER_ID, role: route.role });
    mocks.accountClaim.mockResolvedValue({ count: 1 });
    mocks.packageRead.mockResolvedValue(null);
    const response = await route.invoke();
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.voucherCreate).not.toHaveBeenCalled();
    expect(mocks.pointsCreate).not.toHaveBeenCalled();
    expect(mocks.grantCreate).not.toHaveBeenCalled();
  });
});