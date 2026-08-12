import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  checkRateLimit: vi.fn(),
  issueVoucher: vi.fn(),
  findExistingVoucher: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { voucher: { findFirst: mocks.findExistingVoucher } },
}));
vi.mock("@/lib/voucherIssuance", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/voucherIssuance")>();
  return { ...original, issueVoucher: mocks.issueVoucher };
});

import { POST } from "@/app/api/profile/vouchers/claim/route";

const packageId = "550e8400-e29b-41d4-a716-446655440002";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/profile/vouchers/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/vouchers/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it("nhận voucher miễn phí mà không đi qua luồng trừ điểm", async () => {
    mocks.issueVoucher.mockResolvedValue({
      id: "voucher-1", qr_token: "public-token", voucher_type: "BUNDLE",
      status: "ACTIVE", expires_at: null,
    });

    const response = await POST(request({ package_id: packageId }));

    expect(response.status).toBe(201);
    expect(mocks.issueVoucher).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ package_id: packageId, source: "FREE_CLAIM" }),
    );
    expect(await response.json()).toEqual({ data: {
      qr_token: "public-token", voucher_type: "BUNDLE", status: "ACTIVE",
      expires_at: null, already_granted: false,
    } });
  });

  it("trả lại voucher cũ khi khách bấm nhận lặp", async () => {
    mocks.issueVoucher.mockResolvedValue({ id: "voucher-1", already_granted: true });
    mocks.findExistingVoucher.mockResolvedValue({
      qr_token: "existing-token", voucher_type: "BUNDLE", status: "ACTIVE", expires_at: null,
    });

    const response = await POST(request({ package_id: packageId }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: {
      qr_token: "existing-token", voucher_type: "BUNDLE", status: "ACTIVE",
      expires_at: null, already_granted: true,
    } });
  });

  it("từ chối tài khoản không phải CUSTOMER", async () => {
    mocks.getSession.mockResolvedValue({ id: "staff-1", role: "STAFF" });

    const response = await POST(request({ package_id: packageId }));

    expect(response.status).toBe(403);
    expect(mocks.issueVoucher).not.toHaveBeenCalled();
  });
});
