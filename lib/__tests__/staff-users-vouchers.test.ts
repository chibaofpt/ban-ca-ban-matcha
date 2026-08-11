/**
 * Unit tests for GET /api/staff/users/[id]/vouchers.
 *
 * Strategy: mock lib/prisma and lib/auth.
 * The route file doesn't exist yet — tests will fail to compile until it's implemented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks declared BEFORE imports ────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockVoucherFindMany = vi.fn();
const mockVoucherUpdateMany = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    voucher: {
      findMany: (...args: unknown[]) => mockVoucherFindMany(...args),
      updateMany: (...args: unknown[]) => mockVoucherUpdateMany(...args),
    },
    voucherPackage: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

// Import AFTER mocks
import { GET } from "@/app/api/staff/users/[id]/vouchers/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440100";
const STAFF_SESSION = { id: "550e8400-e29b-41d4-a716-446655440200", role: "STAFF" };
const ADMIN_SESSION = { id: "550e8400-e29b-41d4-a716-446655440201", role: "ADMIN" };
const CUSTOMER_SESSION = { id: "550e8400-e29b-41d4-a716-446655440202", role: "CUSTOMER" };

function makeReq(userId: string): NextRequest {
  return new NextRequest(`http://localhost/api/staff/users/${userId}/vouchers`, {
    method: "GET",
  });
}

function makeParams(userId: string) {
  return { params: Promise.resolve({ id: userId }) };
}

// Sample voucher data
const sampleActiveVoucher = {
  id: "v-001",
  qr_token: "voucher-public-token",
  user_id: CUSTOMER_ID,
  status: "ACTIVE",
  voucher_type: "DISCOUNT",
  discount_type: "FIXED",
  discount_value: 10000,
  expires_at: null,
  package: { name: "Gói Giảm Giá", description: "Giảm 10k", points_cost: 100 },
  menuItem: null,
  addonOption: null,
  staff: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/staff/users/[id]/vouchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVoucherFindMany.mockResolvedValue([]);
    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });
    mockUserFindUnique.mockResolvedValue({
      id: CUSTOMER_ID,
      qr_token: "customer-public-token",
      role: "CUSTOMER",
    });
  });

  it("trả 401 khi chưa đăng nhập", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(makeReq(CUSTOMER_ID), makeParams(CUSTOMER_ID));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("UNAUTHORIZED");
  });

  it("trả 403 khi role là CUSTOMER", async () => {
    mockGetSession.mockResolvedValue(CUSTOMER_SESSION);
    const res = await GET(makeReq(CUSTOMER_ID), makeParams(CUSTOMER_ID));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("FORBIDDEN");
  });

  it("STAFF lấy voucher ACTIVE của khách → 200 + list", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    mockVoucherFindMany.mockResolvedValue([sampleActiveVoucher]);
    const res = await GET(makeReq(CUSTOMER_ID), makeParams(CUSTOMER_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].qr_token).toBe("voucher-public-token");
    expect(json.data[0]).not.toHaveProperty("id");
  });

  it("ADMIN lấy voucher của khách → 200", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockVoucherFindMany.mockResolvedValue([sampleActiveVoucher]);
    const res = await GET(makeReq(CUSTOMER_ID), makeParams(CUSTOMER_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("user_id không tồn tại → trả 200 với list rỗng", async () => {
    // No 404 — prevents info leak about user existence
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    mockVoucherFindMany.mockResolvedValue([]);
    mockUserFindUnique.mockResolvedValue(null);
    const unknownId = "550e8400-e29b-41d4-a716-446655440999";
    const res = await GET(makeReq(unknownId), makeParams(unknownId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it("chỉ trả voucher status = ACTIVE, bỏ qua REDEEMED/EXPIRED", async () => {
    mockGetSession.mockResolvedValue(STAFF_SESSION);
    // findMany is called with where: { status: "ACTIVE" } — mock returns only ACTIVE
    mockVoucherFindMany.mockResolvedValue([sampleActiveVoucher]);
    const res = await GET(makeReq(CUSTOMER_ID), makeParams(CUSTOMER_ID));
    expect(res.status).toBe(200);

    // Verify the query filters by status = ACTIVE
    expect(mockVoucherFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });
});
