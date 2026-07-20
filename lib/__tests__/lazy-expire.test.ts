/**
 * Tests for lazyExpireVouchers — lazy sync ACTIVE vouchers past expires_at to EXPIRED.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockVoucherUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    voucher: {
      updateMany: (...args: unknown[]) => mockVoucherUpdateMany(...args),
    },
  },
}));

// ── Import after mock ─────────────────────────────────────────────────────────

import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "user-001";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("lazyExpireVouchers — lazy sync ACTIVE → EXPIRED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chuyển ACTIVE + expires_at <= now → EXPIRED", async () => {
    mockVoucherUpdateMany.mockResolvedValue({ count: 2 });

    const count = await lazyExpireVouchers(USER_ID);

    expect(count).toBe(2);
    expect(mockVoucherUpdateMany).toHaveBeenCalledWith({
      where: {
        user_id: USER_ID,
        status: "ACTIVE",
        expires_at: { lte: expect.any(Date) },
      },
      data: { status: "EXPIRED" },
    });
  });

  it("không chuyển RESERVED → EXPIRED (order đã reserve hợp lệ)", async () => {
    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });

    await lazyExpireVouchers(USER_ID);

    // The where clause should only target ACTIVE, never RESERVED
    const callArgs = mockVoucherUpdateMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("ACTIVE");
  });

  it("trả count = 0 khi không có voucher hết hạn", async () => {
    mockVoucherUpdateMany.mockResolvedValue({ count: 0 });

    const count = await lazyExpireVouchers(USER_ID);
    expect(count).toBe(0);
  });
});
