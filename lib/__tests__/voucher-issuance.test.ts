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
  mockMenuItemFindMany,
  mockPowderFindMany,
  mockMilkTypeFindMany,
  mockAddonOptionFindMany,
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
    mockMenuItemFindMany.mockResolvedValue([]);
    mockPowderFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
    mockAddonOptionFindMany.mockResolvedValue([]);
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

  it("chặn mọi issuance mode khi BUNDLE không còn qualifier live", async () => {
    mockPackageFindUnique.mockResolvedValue(makePackage({
      voucher_type: "BUNDLE",
      bundleRule: {
        reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
        productScopes: [{ role: "QUALIFIER", menu_item_id: "inactive-menu", default_powder_id: null,
          default_base_liquid_id: null, sizes: [{ size: "SMALL" }] }],
        addonRewards: [],
      },
    }));
    await expect(issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID, package_id: PACKAGE_ID, source: "POINTS_EXCHANGE", now: NOW,
    })).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "NO_ACTIVE_QUALIFIER");
      return true;
    });
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
  });

  it("chặn points, free và auto issuance cho PRODUCT target unavailable", async () => {
    for (const source of ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"] as const) {
      vi.clearAllMocks();
      mockPackageFindUnique.mockResolvedValue(makePackage({
        voucher_type: "PRODUCT", acquisition_mode: source,
        points_cost: source === "POINTS_EXCHANGE" ? 10 : 0,
        menu_item_id: "inactive-product", size: "SMALL",
      }));
      mockMenuItemFindMany.mockResolvedValue([]);
      await expect(issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID, package_id: PACKAGE_ID, source, now: NOW,
      })).rejects.toSatisfy((error: unknown) => {
        expectReason(error, "TARGET_UNAVAILABLE");
        return true;
      });
      expect(mockVoucherCreate).not.toHaveBeenCalled();
    }
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

  it("lazy AUTO_GRANT nhiều package chỉ tải một batch catalog live trong transaction", async () => {
    const secondPackageId = "550e8400-e29b-41d4-a716-446655440099";
    mockPackageFindMany.mockResolvedValue([{ id: secondPackageId }, { id: PACKAGE_ID }]);
    mockPackageFindUnique.mockImplementation(async (args: unknown) => {
      const packageId = (args as { where: { id: string } }).where.id;
      return makePackage({ id: packageId, acquisition_mode: "AUTO_GRANT", points_cost: 0 });
    });
    mockVoucherCreate
      .mockResolvedValueOnce({ id: VOUCHER_ID, qr_token: "voucher-token-1" })
      .mockResolvedValueOnce({ id: "voucher-id-2", qr_token: "voucher-token-2" });
    const transaction = vi.fn().mockImplementation(
      async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
    );
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).resolves.toEqual({
      granted: 2,
      already_granted: 0,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mockMenuItemFindMany).toHaveBeenCalledTimes(1);
    expect(mockPowderFindMany).toHaveBeenCalledTimes(1);
    expect(mockMilkTypeFindMany).toHaveBeenCalledTimes(1);
    expect(mockAddonOptionFindMany).toHaveBeenCalledTimes(1);
  });
});
