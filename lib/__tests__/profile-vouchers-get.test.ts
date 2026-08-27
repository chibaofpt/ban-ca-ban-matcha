import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: { voucher: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/voucherAvailability", () => ({
  loadVoucherAvailabilityCatalog: vi.fn().mockResolvedValue({}),
  attachOwnedVoucherAvailability: (vouchers: unknown[]) => vouchers,
}));
vi.mock("@/lib/voucherBundleDto", () => ({
  attachBundleRewardBaselines: (_db: unknown, vouchers: unknown[]) => Promise.resolve(vouchers),
}));
vi.mock("@/lib/voucherPublicDto", () => ({
  toPublicVoucherDto: (voucher: { qr_token: string; status: string }) => ({
    qr_token: voucher.qr_token,
    status: voucher.status,
  }),
}));

import { GET } from "@/app/api/profile/vouchers/route";

describe("GET /api/profile/vouchers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "customer-id", role: "CUSTOMER" });
    mocks.findMany.mockResolvedValue([]);
  });

  it("uses a bounded read-only query", async () => {
    const response = await GET(new NextRequest("http://localhost/api/profile/vouchers"));

    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 51,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }));
    await expect(response.json()).resolves.toMatchObject({
      data: [],
      meta: { limit: 50, has_more: false, next_cursor: null },
    });
  });

  it("projects effective expiry without mutating storage", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "550e8400-e29b-41d4-a716-446655440000",
      qr_token: "voucher-token",
      status: "ACTIVE",
      expires_at: new Date("2020-01-01T00:00:00.000Z"),
    }]);

    const response = await GET(new NextRequest("http://localhost/api/profile/vouchers?limit=10"));
    const body = await response.json();

    expect(body.data[0]).toEqual({ qr_token: "voucher-token", status: "EXPIRED" });
  });

  it("rejects malformed cursors before querying", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/profile/vouchers?cursor=bm90LWEtdXVpZA"),
    );

    expect(response.status).toBe(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
