import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockPackageFindUnique = vi.fn();
const mockVoucherCount = vi.fn();
const mockVoucherFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    voucherPackage: { findUnique: (...args: unknown[]) => mockPackageFindUnique(...args) },
    voucher: {
      count: (...args: unknown[]) => mockVoucherCount(...args),
      findMany: (...args: unknown[]) => mockVoucherFindMany(...args),
    },
  },
}));

import { GET } from "@/app/api/admin/voucher-packages/[id]/recipients/[userQrToken]/route";

const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_TOKEN = "33333333-3333-4333-8333-333333333333";

const params = { params: Promise.resolve({ id: PACKAGE_ID, userQrToken: USER_TOKEN }) };
const request = (query: string) => new NextRequest(`http://localhost/api/admin/voucher-packages/${PACKAGE_ID}/recipients/${USER_TOKEN}?${query}`);

function whereOf(call: unknown[] | undefined): Record<string, unknown> {
  return ((call?.[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {});
}

describe("GET /api/admin/voucher-packages/[id]/recipients/[userQrToken]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
    mockUserFindUnique.mockResolvedValue({
      id: USER_ID,
      qr_token: USER_TOKEN,
      name: "An",
      phone_number: "0901234567",
      role: "CUSTOMER",
    });
    mockPackageFindUnique.mockResolvedValue({
      id: PACKAGE_ID,
      visibility: "PUBLIC",
      max_per_user: 2,
      quantity: 5,
      expires_after_days: 3,
      ends_at: null,
      is_active: true,
    });
    mockVoucherCount.mockImplementation(async (args: unknown) => {
      const where = (args as { where: Record<string, unknown> }).where;
      if (where.status === "REDEEMED") return 1;
      if (where.issued_via) return 2;
      if (where.user_id) return 1;
      return 3;
    });
    mockVoucherFindMany.mockResolvedValue([]);
  });

  it("filters CURRENT to unexpired ACTIVE and every RESERVED row", async () => {
    mockVoucherFindMany.mockResolvedValue([{
      id: "44444444-4444-4444-8444-444444444444",
      qr_token: "voucher-current",
      issued_via: "ADMIN",
      status: "RESERVED",
      created_at: new Date("2026-08-11T10:00:00.000Z"),
      expires_at: new Date("2000-01-01T00:00:00.000Z"),
      redeemed_at: null,
    }]);

    const response = await GET(request("status=CURRENT"), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(whereOf(mockVoucherFindMany.mock.calls[0])).toMatchObject({
      package_id: PACKAGE_ID,
      user_id: USER_ID,
      AND: expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { status: "RESERVED" },
            { status: "ACTIVE", OR: expect.any(Array) },
          ]),
        }),
      ]),
    });
    expect(mockVoucherFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }));
    expect(json.data.vouchers[0]).toMatchObject({
      qr_token: "voucher-current",
      issued_via: "ADMIN",
      effective_status: "RESERVED",
    });
  });

  it("keeps CURRENT lifecycle predicates when applying a cursor", async () => {
    const cursor = Buffer.from(JSON.stringify({
      created_at: "2026-08-11T10:00:00.000Z",
      id: "44444444-4444-4444-8444-444444444444",
    }), "utf8").toString("base64url");

    const response = await GET(request(`status=CURRENT&cursor=${cursor}`), params);
    expect(response.status).toBe(200);
    const where = whereOf(mockVoucherFindMany.mock.calls[0]);
    expect(where).toMatchObject({ package_id: PACKAGE_ID, user_id: USER_ID });
    expect(where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({
        OR: expect.arrayContaining([
          { status: "RESERVED" },
          { status: "ACTIVE", OR: expect.any(Array) },
        ]),
      }),
      expect.objectContaining({
        OR: expect.arrayContaining([
          { created_at: { lt: expect.any(Date) } },
          { created_at: expect.any(Date), id: { lt: "44444444-4444-4444-8444-444444444444" } },
        ]),
      }),
    ]));
  });

  it("filters USED to REDEEMED and projects expired ACTIVE status without writing", async () => {
    mockVoucherFindMany.mockResolvedValue([{
      id: "55555555-5555-4555-8555-555555555555",
      qr_token: "voucher-expired",
      issued_via: "POINTS_EXCHANGE",
      status: "ACTIVE",
      created_at: new Date("2026-08-10T10:00:00.000Z"),
      expires_at: new Date("2000-01-01T00:00:00.000Z"),
      redeemed_at: null,
    }]);

    const response = await GET(request("status=USED"), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(whereOf(mockVoucherFindMany.mock.calls[0])).toMatchObject({
      package_id: PACKAGE_ID,
      user_id: USER_ID,
      AND: [{ status: "REDEEMED" }],
    });
    expect(json.data.vouchers[0].effective_status).toBe("EXPIRED");
  });

  it("returns at most 20 rows and an opaque cursor for the next page", async () => {
    mockVoucherFindMany.mockResolvedValue(Array.from({ length: 21 }, (_, index) => ({
      id: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
      qr_token: `voucher-${index}`,
      issued_via: "FREE_CLAIM",
      status: "REDEEMED",
      created_at: new Date(Date.UTC(2026, 7, 11, 10, index)),
      expires_at: null,
      redeemed_at: new Date(Date.UTC(2026, 7, 12, 10, index)),
    })));

    const response = await GET(request("status=ALL"), params);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.vouchers).toHaveLength(20);
    expect(json.data.meta).toMatchObject({ has_more: true });
    expect(typeof json.data.meta.next_cursor).toBe("string");
  });

  it("rejects a non-CUSTOMER recipient without reading voucher history", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: USER_ID,
      qr_token: USER_TOKEN,
      name: "Staff",
      phone_number: "0901234567",
      role: "STAFF",
    });

    const response = await GET(request("status=ALL"), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "RECIPIENT_NOT_CUSTOMER" },
    });
    expect(mockVoucherFindMany).not.toHaveBeenCalled();
  });
});
