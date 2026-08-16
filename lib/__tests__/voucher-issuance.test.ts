import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureAutoGrantedVouchers,
  issueVoucherInTransaction,
  type VoucherIssuanceDatabase,
  type VoucherIssuanceTransaction,
} from "@/lib/voucherIssuance";
import {
  NOW,
  PACKAGE_ID,
  USER_ID,
  VOUCHER_ID,
  expectReason,
  makePackage,
  makeTx,
  mockGrantCreate,
  mockGrantFindUnique,
  mockPackageFindMany,
  mockPackageFindUnique,
  mockPointsLogCreate,
  mockUserUpdateMany,
  mockVoucherCount,
  mockVoucherCreate,
} from "@/lib/__tests__/voucher-issuance.fixtures";

describe("Phát hành voucher dùng chung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPackageFindUnique.mockResolvedValue(makePackage());
    mockVoucherCount.mockResolvedValue(0);
    mockVoucherCreate.mockResolvedValue({ id: VOUCHER_ID, qr_token: "voucher-token" });
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockPointsLogCreate.mockResolvedValue({ id: "log-id" });
    mockGrantFindUnique.mockResolvedValue(null);
    mockGrantCreate.mockResolvedValue({ id: "grant-id" });
  });

  it("POINTS_EXCHANGE trừ điểm có điều kiện, snapshot voucher và ghi points_log", async () => {
    const result = await issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "POINTS_EXCHANGE",
      now: NOW,
    });

    expect("already_granted" in result ? null : result.qr_token).toBe("voucher-token");
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, points_balance: { gte: 10 } },
      data: { points_balance: { decrement: 10 } },
    });
    expect(mockVoucherCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: USER_ID,
          package_id: PACKAGE_ID,
          issued_via: "POINTS_EXCHANGE",
          discount_value: 20_000,
          expires_at: new Date("2026-09-10T10:00:00.000Z"),
        }),
      }),
    );
    expect(mockPointsLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: USER_ID,
        delta: -10,
        reason: "voucher_purchase",
        voucher_id: VOUCHER_ID,
      }),
    });
    expect(mockGrantCreate).not.toHaveBeenCalled();
  });

  it("chặn race số dư khi conditional update không cập nhật user", async () => {
    mockUserUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "POINTS_EXCHANGE",
        now: NOW,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "INSUFFICIENT_POINTS");
      return true;
    });
    expect(mockVoucherCreate).not.toHaveBeenCalled();
  });

  it("FREE_CLAIM không trừ điểm, không ghi points_log và tạo grant chống trùng", async () => {
    mockPackageFindUnique.mockResolvedValue(
      makePackage({ acquisition_mode: "FREE_CLAIM", points_cost: 0 }),
    );

    await issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "FREE_CLAIM",
      now: NOW,
    });

    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
    expect(mockGrantCreate).toHaveBeenCalledWith({
      data: { user_id: USER_ID, package_id: PACKAGE_ID, voucher_id: VOUCHER_ID },
    });
  });

  it("từ chối claim thủ công package AUTO_GRANT", async () => {
    mockPackageFindUnique.mockResolvedValue(
      makePackage({ acquisition_mode: "AUTO_GRANT", points_cost: 0 }),
    );

    await expect(
      issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "FREE_CLAIM",
        now: NOW,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "ACQUISITION_MODE_MISMATCH");
      return true;
    });
  });

  it("AUTO_GRANT bỏ qua user đã được cấp package này", async () => {
    mockPackageFindUnique.mockResolvedValue(
      makePackage({ acquisition_mode: "AUTO_GRANT", points_cost: 0 }),
    );
    mockGrantFindUnique.mockResolvedValue({ voucher_id: VOUCHER_ID });

    const result = await issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "AUTO_GRANT",
      now: NOW,
    });

    expect(result).toEqual({ id: VOUCHER_ID, already_granted: true });
    expect(mockVoucherCreate).not.toHaveBeenCalled();
  });

  it("từ chối package hết quantity hoặc vượt max_per_user bên trong transaction", async () => {
    mockPackageFindUnique.mockResolvedValue(makePackage({ quantity: 1, max_per_user: 1 }));
    mockVoucherCount.mockResolvedValueOnce(1);

    await expect(
      issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "POINTS_EXCHANGE",
        now: NOW,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "VOUCHER_SOLD_OUT");
      return true;
    });

    mockVoucherCount.mockReset();
    mockVoucherCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(
      issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "POINTS_EXCHANGE",
        now: NOW,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "VOUCHER_LIMIT_REACHED");
      return true;
    });
  });

  it("chỉ phát hành trong cửa sổ campaign đang active", async () => {
    mockPackageFindUnique.mockResolvedValue(
      makePackage({
        acquisition_mode: "AUTO_GRANT",
        points_cost: 0,
        ends_at: new Date("2026-08-11T09:59:59.000Z"),
      }),
    );

    await expect(
      issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "AUTO_GRANT",
        now: NOW,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "VOUCHER_PACKAGE_EXPIRED");
      return true;
    });
  });

  it("cắt expires_at theo thời điểm campaign kết thúc", async () => {
    mockPackageFindUnique.mockResolvedValue(
      makePackage({
        acquisition_mode: "AUTO_GRANT",
        points_cost: 0,
        ends_at: new Date("2026-08-15T00:00:00.000Z"),
      }),
    );

    await issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "AUTO_GRANT",
      now: NOW,
    });

    expect(mockVoucherCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expires_at: new Date("2026-08-15T00:00:00.000Z") }),
      }),
    );
  });

  it("lazy AUTO_GRANT bỏ qua campaign hết số lượng để ví vẫn tải được", async () => {
    mockPackageFindMany.mockResolvedValue([{ id: PACKAGE_ID }]);
    mockPackageFindUnique.mockResolvedValue(
      makePackage({ acquisition_mode: "AUTO_GRANT", points_cost: 0, quantity: 1 }),
    );
    mockVoucherCount.mockResolvedValueOnce(1);
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: vi.fn().mockImplementation(
        async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
      ),
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).resolves.toEqual({
      granted: 0,
      already_granted: 0,
    });
  });
});
