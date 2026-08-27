import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mockGetSession = vi.fn();
const mockResolve = vi.fn();
const mockUpdateMany = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/publicIdentifiers", () => ({ resolveStaffVoucherIdentifier: (...args: unknown[]) => mockResolve(...args) }));
vi.mock("@/lib/prisma", () => ({ prisma: { voucher: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) } } }));
import { PATCH } from "@/app/api/staff/vouchers/[id]/redeem/route";

describe("QR offline PRODUCT_DISCOUNT", () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetSession.mockResolvedValue({ id: "staff", role: "STAFF" }); });
  it("từ chối order-only và không update voucher", async () => {
    mockResolve.mockResolvedValue({ id: "voucher", qr_token: "token", voucher_type: "PRODUCT_DISCOUNT", status: "ACTIVE", expires_at: null });
    const response = await PATCH(new NextRequest("http://localhost"), { params: Promise.resolve({ id: "token" }) });
    expect(response.status).toBe(422);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
