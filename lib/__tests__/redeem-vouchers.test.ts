/**
 * Tests for redeemOrderVouchers — shared voucher redeem helper.
 * Batch updateMany RESERVED → REDEEMED with count guard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockVoucherUpdateMany = vi.fn();

// ── Import after mock ─────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { redeemOrderVouchers, VoucherRedeemError } from "@/lib/redeemVouchers";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORDER_ID = "order-001";
const STAFF_ID = "staff-001";

function makeTx() {
  return {
    voucher: {
      updateMany: mockVoucherUpdateMany,
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("redeemOrderVouchers — batch redeem helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("batch updateMany RESERVED → REDEEMED với đúng channel ONLINE", async () => {
    const voucherIds = ["v1", "v2", "v3"];
    mockVoucherUpdateMany.mockResolvedValue({ count: 3 });

    await redeemOrderVouchers(
      makeTx() as never,
      voucherIds,
      "ONLINE",
      STAFF_ID
    );

    expect(mockVoucherUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: voucherIds },
        status: "RESERVED",
      },
      data: expect.objectContaining({
        status: "REDEEMED",
        used_channel: "ONLINE",
        redeemed_by: STAFF_ID,
      }),
    });
  });

  it("batch updateMany RESERVED → REDEEMED với channel OFFLINE", async () => {
    const voucherIds = ["v1"];
    mockVoucherUpdateMany.mockResolvedValue({ count: 1 });

    await redeemOrderVouchers(
      makeTx() as never,
      voucherIds,
      "OFFLINE",
      STAFF_ID
    );

    expect(mockVoucherUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: voucherIds },
        status: "RESERVED",
      },
      data: expect.objectContaining({
        status: "REDEEMED",
        used_channel: "OFFLINE",
      }),
    });
  });

  it("supports the ACTIVE → REDEEMED claim used by completed counter orders", async () => {
    mockVoucherUpdateMany.mockResolvedValue({ count: 1 });

    await redeemOrderVouchers(makeTx() as never, ["v1"], "OFFLINE", STAFF_ID, "ACTIVE");

    expect(mockVoucherUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["v1"] }, status: "ACTIVE" },
      })
    );
  });

  it("throw VOUCHER_MISMATCH nếu count !== expected", async () => {
    const voucherIds = ["v1", "v2"];
    mockVoucherUpdateMany.mockResolvedValue({ count: 1 }); // Only 1 of 2 updated

    await expect(
      redeemOrderVouchers(makeTx() as never, voucherIds, "ONLINE", STAFF_ID)
    ).rejects.toThrow(VoucherRedeemError);

    await expect(
      redeemOrderVouchers(makeTx() as never, voucherIds, "ONLINE", STAFF_ID)
    ).rejects.toThrow(/VOUCHER_MISMATCH/);
  });

  it("xử lý order không có voucher nào (empty IDs) — không gọi updateMany", async () => {
    await redeemOrderVouchers(
      makeTx() as never,
      [],
      "ONLINE",
      STAFF_ID
    );

    expect(mockVoucherUpdateMany).not.toHaveBeenCalled();
  });
});
