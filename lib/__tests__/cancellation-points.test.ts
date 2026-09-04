import { describe, expect, it, vi } from "vitest";
import { reverseCancellationPoints } from "@/lib/cancellationPoints";
import { CancellationPointsError, recoverCancellationPoints } from "@/lib/cancellationVoucherRecovery";

type RecoveryTx = Parameters<typeof recoverCancellationPoints>[0];
type CancellationTx = Parameters<typeof reverseCancellationPoints>[0];

function makeRecoveryTx() {
  return {
    voucher: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn() },
    pointsLog: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
  };
}

function asRecoveryTx(tx: ReturnType<typeof makeRecoveryTx>): RecoveryTx {
  return tx as unknown as RecoveryTx;
}

function asCancellationTx(tx: ReturnType<typeof makeRecoveryTx>): CancellationTx {
  return tx as unknown as CancellationTx;
}

describe("cancellationVoucherRecovery — thu hồi điểm", () => {
  it("không dùng log voucher_refund âm làm bằng chứng mua", async () => {
    const tx = makeRecoveryTx();
    tx.voucher.findMany.mockResolvedValue([{
      id: "voucher-1",
      pointsLogs: [{ id: "refund-1", reason: "voucher_refund", delta: -11, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] }],
    }]);
    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 2, requiredPoints: 10, excludedVoucherIds: [], performedBy: "admin-1", orderId: "order-1",
    })).rejects.toBeInstanceOf(CancellationPointsError);
    expect(tx.voucher.updateMany).not.toHaveBeenCalled();
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });
  it("không có nợ điểm thì không đọc hay ghi", async () => {
    const tx = makeRecoveryTx();

    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 7, requiredPoints: 7, excludedVoucherIds: [], performedBy: null, orderId: "order-1",
    })).resolves.toEqual({ revokedVoucherCount: 0, refundedPoints: 0 });
    expect(tx.voucher.findMany).not.toHaveBeenCalled();
    expect(tx.voucher.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });

  it("hoàn lại theo giá trị âm trong purchase audit", async () => {
    const tx = makeRecoveryTx();
    tx.voucher.findMany.mockResolvedValue([{
      id: "voucher-1",
      pointsLogs: [{ id: "purchase-1", reason: "voucher_purchase", delta: -11, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] }],
    }]);

    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 2, requiredPoints: 10, excludedVoucherIds: [], performedBy: "admin-1", orderId: "order-1",
    })).resolves.toEqual({ revokedVoucherCount: 1, refundedPoints: 11 });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { points_balance: { increment: 11 } } }));
    expect(tx.pointsLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delta: 11, reason: "voucher_refund", reversed_log_id: "purchase-1" }) }));
  });

  it("loại voucher thuộc đơn đang hủy và từ chối audit thiếu, trộn hoặc không hợp lệ", async () => {
    const tx = makeRecoveryTx();
    tx.voucher.findMany.mockResolvedValue([{ id: "voucher-2", pointsLogs: [] }]);

    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 0, requiredPoints: 1, excludedVoucherIds: ["used-by-order"], performedBy: null, orderId: "order-1",
    })).rejects.toMatchObject({ code: "BUSINESS_RULE_VIOLATION", reason: "INSUFFICIENT_REVERSIBLE_POINTS" });
    expect(tx.voucher.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ["used-by-order"] } }) }));
    expect(tx.voucher.updateMany).not.toHaveBeenCalled();
  });

  it("từ chối purchase audit trộn nhiều row hoặc sai chủ sở hữu", async () => {
    const mixedTx = makeRecoveryTx();
    mixedTx.voucher.findMany.mockResolvedValue([{
      id: "voucher-1",
      pointsLogs: [
        { id: "purchase-1", reason: "voucher_purchase", delta: -4, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] },
        { id: "refund-1", delta: 4, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] },
      ],
    }]);
    const invalidTx = makeRecoveryTx();
    invalidTx.voucher.findMany.mockResolvedValue([{
      id: "voucher-2",
      pointsLogs: [{ id: "purchase-2", reason: "voucher_purchase", delta: -4, user_id: "other-user", voucher_id: "voucher-2", reversalLogs: [] }],
    }]);
    const input = { userId: "user-1", currentBalance: 0, requiredPoints: 1, excludedVoucherIds: [], performedBy: null, orderId: "order-1" };

    await expect(recoverCancellationPoints(asRecoveryTx(mixedTx), input)).rejects.toBeInstanceOf(CancellationPointsError);
    await expect(recoverCancellationPoints(asRecoveryTx(invalidTx), input)).rejects.toBeInstanceOf(CancellationPointsError);
    expect(mixedTx.voucher.updateMany).not.toHaveBeenCalled();
    expect(invalidTx.voucher.updateMany).not.toHaveBeenCalled();
  });

  it("count=0 khi refund voucher thì không tạo hoàn điểm sau đó", async () => {
    const tx = makeRecoveryTx();
    tx.voucher.findMany.mockResolvedValue([{
      id: "voucher-1",
      pointsLogs: [{ id: "purchase-1", reason: "voucher_purchase", delta: -5, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] }],
    }]);
    tx.voucher.updateMany.mockResolvedValue({ count: 0 });

    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 0, requiredPoints: 5, excludedVoucherIds: [], performedBy: null, orderId: "order-1",
    })).rejects.toBeInstanceOf(CancellationPointsError);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });

  it("thiếu điểm có thể thu hồi ném business error", async () => {
    const tx = makeRecoveryTx();
    tx.voucher.findMany.mockResolvedValue([{
      id: "voucher-1",
      pointsLogs: [{ id: "purchase-1", reason: "voucher_purchase", delta: -3, user_id: "user-1", voucher_id: "voucher-1", reversalLogs: [] }],
    }]);

    await expect(recoverCancellationPoints(asRecoveryTx(tx), {
      userId: "user-1", currentBalance: 0, requiredPoints: 4, excludedVoucherIds: [], performedBy: null, orderId: "order-1",
    })).rejects.toMatchObject({ code: "BUSINESS_RULE_VIOLATION", reason: "INSUFFICIENT_REVERSIBLE_POINTS" });
  });
});

describe("reverseCancellationPoints — đảo đúng phần chưa đảo", () => {
  it.each([
    { user_id: "foreign-user" },
    { order_id: "foreign-order" },
    { reason: "manual_admin_adjustment" },
    { reversed_log_id: "foreign-award" },
    { reversalLogs: [{ id: "reversed-reversal" }] },
  ])("từ chối reversal audit không đáng tin: %j", async (invalid) => {
    const tx = makeRecoveryTx();
    tx.pointsLog.findMany.mockResolvedValueOnce([{
      id: "award", user_id: "user-1", delta: 10, reason: "order_complete", voucher_id: null,
      reversalLogs: [{ delta: -3, user_id: "user-1", order_id: "order-1", reason: "order_complete_reversed", reversed_log_id: "award", reversalLogs: [], ...invalid }],
    }]).mockResolvedValueOnce([]);
    tx.user.findUniqueOrThrow.mockResolvedValue({ points_balance: 10 });
    await expect(reverseCancellationPoints(asCancellationTx(tx), {
      orderId: "order-1", performedBy: "admin-1", excludedVoucherIds: [],
    })).rejects.toBeInstanceOf(CancellationPointsError);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });
  it("không có award còn lại thì không ghi hoặc debit", async () => {
    const tx = makeRecoveryTx();
    tx.pointsLog.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await expect(reverseCancellationPoints(asCancellationTx(tx), {
      orderId: "order-1", performedBy: null, excludedVoucherIds: [],
    })).resolves.toEqual({ revoked_voucher_count: 0, refunded_points: 0, reversed_points: 0 });
    expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });

  it("chỉ debit phần award còn lại và ghi reversal âm liên kết", async () => {
    const tx = makeRecoveryTx();
    tx.pointsLog.findMany
      .mockResolvedValueOnce([{ id: "award-order", user_id: "user-1", delta: 5, reason: "order_complete", voucher_id: null, reversalLogs: [{ delta: -2, user_id: "user-1", order_id: "order-1", reason: "order_complete_reversed", reversed_log_id: "award-order", reversalLogs: [] }] }])
      .mockResolvedValueOnce([{ id: "award-surplus", user_id: "user-1", delta: 4, reason: "voucher_surplus", voucher_id: null, reversalLogs: [] }]);
    tx.user.findUniqueOrThrow.mockResolvedValue({ points_balance: 20 });

    await expect(reverseCancellationPoints(asCancellationTx(tx), {
      orderId: "order-1", performedBy: "admin-1", excludedVoucherIds: [],
    })).resolves.toEqual({ revoked_voucher_count: 0, refunded_points: 0, reversed_points: 7 });
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-1", points_balance: { gte: 7 } }, data: { points_balance: { decrement: 7 } } });
    expect(tx.pointsLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delta: -3, reason: "order_complete_reversed", reversed_log_id: "award-order" }) }));
    expect(tx.pointsLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ delta: -4, reason: "voucher_surplus_reversed", reversed_log_id: "award-surplus" }) }));
  });

  it("count=0 khi debit cuối cùng thì không tạo reversal log", async () => {
    const tx = makeRecoveryTx();
    tx.pointsLog.findMany.mockResolvedValueOnce([{ id: "award", user_id: "user-1", delta: 2, reason: "order_complete", voucher_id: null, reversalLogs: [] }]).mockResolvedValueOnce([]);
    tx.user.findUniqueOrThrow.mockResolvedValue({ points_balance: 2 });
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(reverseCancellationPoints(asCancellationTx(tx), { orderId: "order-1", performedBy: null, excludedVoucherIds: [] })).rejects.toThrow("Point balance changed concurrently");
    expect(tx.pointsLog.create).not.toHaveBeenCalled();
  });
});
