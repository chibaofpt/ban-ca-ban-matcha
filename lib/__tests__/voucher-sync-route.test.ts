import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureAutoGrantedVouchers: vi.fn(),
  lazyExpireVouchers: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/voucherIssuance", () => ({
  ensureAutoGrantedVouchers: mocks.ensureAutoGrantedVouchers,
}));
vi.mock("@/lib/lazyExpireVouchers", () => ({
  lazyExpireVouchers: mocks.lazyExpireVouchers,
}));

import { POST } from "@/app/api/profile/vouchers/sync/route";

describe("POST /api/profile/vouchers/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAutoGrantedVouchers.mockResolvedValue({ granted: 2, already_granted: 1 });
    mocks.lazyExpireVouchers.mockResolvedValue(3);
  });

  it("requires an authenticated CUSTOMER", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);

    mocks.getSession.mockResolvedValue({ id: "staff", role: "STAFF" });
    expect((await POST()).status).toBe(403);
    expect(mocks.ensureAutoGrantedVouchers).not.toHaveBeenCalled();
  });

  it("performs reconciliation only through the explicit POST", async () => {
    mocks.getSession.mockResolvedValue({ id: "customer", role: "CUSTOMER" });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.ensureAutoGrantedVouchers).toHaveBeenCalledWith(expect.anything(), "customer");
    expect(mocks.lazyExpireVouchers).toHaveBeenCalledWith("customer");
    await expect(response.json()).resolves.toEqual({
      data: { granted_count: 2, expired_count: 3 },
    });
  });
});
