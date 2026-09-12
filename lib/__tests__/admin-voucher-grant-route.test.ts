import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockPackageFindUnique = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockVoucherCount = vi.fn();
const mockGrantVoucherWithWarning = vi.fn();
const mockInvalidateVoucherCaches = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/cacheInvalidation", () => ({ invalidateVoucherCaches: () => mockInvalidateVoucherCaches() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    voucherPackage: { findUnique: (...args: unknown[]) => mockPackageFindUnique(...args) },
    voucher: {
      findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args),
      count: (...args: unknown[]) => mockVoucherCount(...args),
    },
  },
}));
vi.mock("@/lib/voucherIssuance", async () => {
  const actual = await vi.importActual<typeof import("@/lib/voucherIssuance")>("@/lib/voucherIssuance");
  return { ...actual };
});
vi.mock("@/lib/adminVoucherGrant", async () => {
  const actual = await vi.importActual<typeof import("@/lib/adminVoucherGrant")>("@/lib/adminVoucherGrant");
  return { ...actual, grantVoucherWithWarning: (db: unknown, input: unknown) => mockGrantVoucherWithWarning(db, input) };
});

import { POST } from "@/app/api/admin/voucher-packages/[id]/grants/route";
import { VoucherIssuanceError } from "@/lib/voucherIssuance";
import { AdminVoucherGrantConfirmationRequiredError } from "@/lib/adminVoucherGrant";

const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const USER_TOKEN = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const params = { params: Promise.resolve({ id: PACKAGE_ID }) };

const request = (body: Record<string, unknown>) => new NextRequest(
  `http://localhost/api/admin/voucher-packages/${PACKAGE_ID}/grants`,
  { method: "POST", body: JSON.stringify(body) },
);

function whereOf(call: unknown[] | undefined): Record<string, unknown> {
  return ((call?.[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {});
}

describe("POST /api/admin/voucher-packages/[id]/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: ADMIN_ID, role: "ADMIN" });
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: "CUSTOMER" });
    mockPackageFindUnique.mockResolvedValue({
      id: PACKAGE_ID,
      visibility: "PRIVATE",
      max_per_user: 1,
      quantity: 5,
      expires_after_days: 3,
      ends_at: null,
      is_active: true,
    });
    mockVoucherFindUnique.mockResolvedValue(null);
    mockVoucherCount.mockImplementation(async (args: unknown) => {
      const where = whereOf([args]);
      if (where.issued_via) return 0;
      if (where.status === "REDEEMED") return 0;
      if (where.user_id && where.OR) return 0;
      return 0;
    });
    mockGrantVoucherWithWarning.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      qr_token: "voucher-token",
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: new Date("2026-08-14T10:00:00.000Z"),
    });
  });

  it("requires acknowledgement for a warning, then reuses the same request id for the acknowledged gift", async () => {
    mockGrantVoucherWithWarning
      .mockRejectedValueOnce(new AdminVoucherGrantConfirmationRequiredError({
        self_acquisition_count: 0,
        self_acquisition_limit: null,
        self_acquisition_remaining: null,
        current_count: 1,
        used_count: 0,
        global_remaining: 4,
        grant_eligible: true,
        warning_reasons: ["ACTIVE_OR_RESERVED_VOUCHER_EXISTS"],
        expiry_preview: new Date("2026-08-14T10:00:00.000Z"),
      }))
      .mockResolvedValueOnce({
        id: "77777777-7777-4777-8777-777777777777",
        qr_token: "voucher-token",
        voucher_type: "DISCOUNT",
        status: "ACTIVE",
        expires_at: new Date("2026-08-14T10:00:00.000Z"),
      });

    const body = { user_qr_token: USER_TOKEN, request_id: REQUEST_ID };
    const warning = await POST(request(body), params);
    const warningJson = await warning.json();
    expect(warning.status).toBe(422);
    expect(warningJson).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      details: {
        reason: "ADDITIONAL_GIFT_CONFIRMATION_REQUIRED",
        summary: { warning_reasons: ["ACTIVE_OR_RESERVED_VOUCHER_EXISTS"] },
      },
    });
    expect(mockGrantVoucherWithWarning).toHaveBeenCalledTimes(1);

    const acknowledged = await POST(request({ ...body, acknowledge_additional_gift: true }), params);
    expect(acknowledged.status).toBe(201);
    expect(mockGrantVoucherWithWarning).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      performed_by: ADMIN_ID,
      request_id: REQUEST_ID,
      acknowledge_additional_gift: true,
    }));
    expect(mockInvalidateVoucherCaches).toHaveBeenCalledTimes(1);
  });

  it("returns the existing voucher for an identical request and conflicts on rebinding", async () => {
    mockGrantVoucherWithWarning.mockResolvedValueOnce({
      id: "77777777-7777-4777-8777-777777777777",
      qr_token: "voucher-token",
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: new Date("2000-01-01T00:00:00.000Z"),
      already_granted: true,
    });

    const replay = await POST(request({ user_qr_token: USER_TOKEN, request_id: REQUEST_ID }), params);
    const replayJson = await replay.json();
    expect(replay.status).toBe(200);
    expect(replayJson.data).toMatchObject({ qr_token: "voucher-token", already_granted: true, effective_status: "EXPIRED" });
    expect(mockGrantVoucherWithWarning).toHaveBeenCalledTimes(1);

    mockGrantVoucherWithWarning.mockRejectedValueOnce(new VoucherIssuanceError("CONFLICT", "Request id is already bound to another gift"));
    const conflict = await POST(request({ user_qr_token: USER_TOKEN, request_id: REQUEST_ID }), params);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("routes acknowledged sold-out gifts through the authoritative stock check", async () => {
    mockPackageFindUnique.mockResolvedValue({
      id: PACKAGE_ID,
      visibility: "PRIVATE",
      max_per_user: 1,
      quantity: 1,
      expires_after_days: 3,
      ends_at: null,
      is_active: true,
    });
    mockVoucherCount.mockImplementation(async (args: unknown) => {
      const where = whereOf([args]);
      return where.user_id ? 0 : 1;
    });
    mockGrantVoucherWithWarning.mockRejectedValue(new VoucherIssuanceError("VOUCHER_SOLD_OUT", "Voucher package is sold out"));

    const response = await POST(request({
      user_qr_token: USER_TOKEN,
      request_id: REQUEST_ID,
      acknowledge_additional_gift: true,
    }), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "VOUCHER_SOLD_OUT" });
    expect(mockGrantVoucherWithWarning).toHaveBeenCalledTimes(1);
  });

  it("requires a CUSTOMER and rejects generic or extra issuance controls", async () => {
    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: "STAFF" });
    const nonCustomer = await POST(request({ user_qr_token: USER_TOKEN, request_id: REQUEST_ID }), params);
    expect(nonCustomer.status).toBe(422);
    expect(await nonCustomer.json()).toMatchObject({ details: { reason: "RECIPIENT_NOT_CUSTOMER" } });

    mockUserFindUnique.mockResolvedValue({ id: USER_ID, role: "CUSTOMER" });
    const extraField = await POST(request({
      user_qr_token: USER_TOKEN,
      request_id: REQUEST_ID,
      source: "POINTS_EXCHANGE",
    }), params);
    expect(extraField.status).toBe(400);
    expect(mockGrantVoucherWithWarning).not.toHaveBeenCalled();
  });
});
