import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOrderFindMany = vi.fn();
const mockTransaction = vi.fn();
const mockRestoreVouchersOnCancel = vi.fn();
const mockCaptureServerException = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findMany: (...args: unknown[]) => mockOrderFindMany(...args) },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/cancelOrder", () => ({
  restoreVouchersOnCancel: (...args: unknown[]) => mockRestoreVouchersOnCancel(...args),
}));

vi.mock("@/lib/observability", () => ({
  captureServerException: (...args: unknown[]) => mockCaptureServerException(...args),
}));

import { runCancelExpiredOrders } from "@/lib/cancelExpiredOrders";

describe("Job auto-cancel order hết hạn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderFindMany.mockResolvedValue([]);
    mockRestoreVouchersOnCancel.mockResolvedValue(undefined);
  });

  it("chỉ lấy tối đa 25 PENDING order cũ nhất", async () => {
    await runCancelExpiredOrders(new Date("2026-08-03T00:00:00.000Z"));

    expect(mockOrderFindMany).toHaveBeenCalledWith({
      where: { status: "PENDING", auto_cancel_at: { lte: expect.any(Date) } },
      select: { id: true },
      orderBy: { auto_cancel_at: "asc" },
      take: 25,
    });
  });

  it("claim bằng updateMany để hai cron không cancel cùng order", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockOrderFindMany.mockResolvedValue([{ id: "order-1" }]);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      order: { updateMany },
    }));

    const result = await runCancelExpiredOrders(new Date());

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(mockRestoreVouchersOnCancel).toHaveBeenCalledTimes(1);
    expect(result.cancelled).toBe(1);
  });

  it("skip restore voucher khi order đã được request khác claim", async () => {
    mockOrderFindMany.mockResolvedValue([{ id: "order-1" }]);
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }));

    const result = await runCancelExpiredOrders(new Date());

    expect(mockRestoreVouchersOnCancel).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("ghi nhận partial failure thay vì chặn các order còn lại", async () => {
    mockOrderFindMany.mockResolvedValue([{ id: "bad" }, { id: "good" }]);
    mockTransaction
      .mockRejectedValueOnce(new Error("DB timeout"))
      .mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }));

    const result = await runCancelExpiredOrders(new Date());

    expect(result).toMatchObject({ selected: 2, cancelled: 1, failed: 1 });
    expect(mockCaptureServerException).toHaveBeenCalledTimes(1);
  });
});
