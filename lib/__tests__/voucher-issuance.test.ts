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

const ADMIN_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const SECOND_REQUEST_ID = "66666666-6666-4666-8666-666666666666";

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

  it("ADMIN gift ghi actor/request, không trừ điểm, không tạo grant và cho phép gift lặp lại", async () => {
    const tx = makeTx();
    tx.voucher.findUnique = vi.fn().mockResolvedValue(null);
    mockPackageFindUnique.mockResolvedValue(makePackage({
      visibility: "PRIVATE",
      acquisition_mode: "NONE",
      points_cost: 0,
      quantity: 3,
      max_per_user: 1,
    }));
    mockVoucherCreate
      .mockResolvedValueOnce({ id: VOUCHER_ID, qr_token: "voucher-token-1" })
      .mockResolvedValueOnce({ id: "77777777-7777-4777-8777-777777777777", qr_token: "voucher-token-2" });

    await issueVoucherInTransaction(tx, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: ADMIN_ID,
      request_id: REQUEST_ID,
      now: NOW,
    });
    await issueVoucherInTransaction(tx, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: ADMIN_ID,
      request_id: SECOND_REQUEST_ID,
      now: NOW,
    });

    expect(mockVoucherCreate).toHaveBeenCalledTimes(2);
    expect(mockVoucherCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        issued_via: "ADMIN",
        issuing_admin_id: ADMIN_ID,
        manual_request_id: REQUEST_ID,
      }),
    }));
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(mockPointsLogCreate).not.toHaveBeenCalled();
    expect(mockGrantCreate).not.toHaveBeenCalled();
    expect(mockVoucherCount).toHaveBeenCalledTimes(2);
    expect(mockVoucherCount).toHaveBeenNthCalledWith(1, {
      where: {
        package_id: PACKAGE_ID,
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT", "ADMIN"] },
      },
    });
  });

  it.each(["WELCOME_GIFT", "GACHA_REWARD"] as const)(
    "%s phát hành package PRIVATE/NONE mà không tạo side effect của points, grant hoặc admin",
    async (source) => {
      mockPackageFindUnique.mockResolvedValue(makePackage({
        visibility: "PRIVATE",
        acquisition_mode: "NONE",
        points_cost: 99,
        quantity: 3,
        max_per_user: 1,
      }));
      mockVoucherCount.mockResolvedValue(3);

      await issueVoucherInTransaction(makeTx(), {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source,
        performed_by: ADMIN_ID,
        request_id: REQUEST_ID,
        now: NOW,
      });

      expect(mockVoucherCreate).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ issued_via: source }),
      }));
      const createData = mockVoucherCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(createData).not.toHaveProperty("issuing_admin_id");
      expect(createData).not.toHaveProperty("manual_request_id");
      expect(mockUserUpdateMany).not.toHaveBeenCalled();
      expect(mockPointsLogCreate).not.toHaveBeenCalled();
      expect(mockGrantFindUnique).not.toHaveBeenCalled();
      expect(mockGrantCreate).not.toHaveBeenCalled();
      expect(mockVoucherCount).not.toHaveBeenCalled();
    },
  );

  it("ADMIN gift replay trả voucher hiện có ngay cả khi package đã pause, và rebinding bị conflict", async () => {
    const tx = makeTx();
    const findUnique = vi.fn().mockResolvedValue({
      id: VOUCHER_ID,
      qr_token: "voucher-token",
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      issued_via: "ADMIN",
      issuing_admin_id: ADMIN_ID,
      manual_request_id: REQUEST_ID,
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: new Date("2026-08-01T00:00:00.000Z"),
      redeemed_at: null,
    });
    tx.voucher.findUnique = findUnique;
    mockPackageFindUnique.mockResolvedValue(makePackage({ is_active: false, quantity: 0 }));

    const replay = await issueVoucherInTransaction(tx, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: ADMIN_ID,
      request_id: REQUEST_ID,
      now: NOW,
    });
    expect(replay).toMatchObject({ id: VOUCHER_ID, already_granted: true, effective_status: "EXPIRED" });
    expect(mockPackageFindUnique).not.toHaveBeenCalled();
    expect(mockVoucherCreate).not.toHaveBeenCalled();

    findUnique.mockResolvedValue({
      id: VOUCHER_ID,
      qr_token: "voucher-token",
      user_id: "88888888-8888-4888-8888-888888888888",
      package_id: PACKAGE_ID,
      issued_via: "ADMIN",
      issuing_admin_id: ADMIN_ID,
      manual_request_id: REQUEST_ID,
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: null,
      redeemed_at: null,
    });
    await expect(issueVoucherInTransaction(tx, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: ADMIN_ID,
      request_id: REQUEST_ID,
      now: NOW,
    })).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "CONFLICT");
      return true;
    });
  });

  it("ADMIN không bypass global quantity dù không áp dụng max_per_user", async () => {
    const tx = makeTx();
    tx.voucher.findUnique = vi.fn().mockResolvedValue(null);
    mockPackageFindUnique.mockResolvedValue(makePackage({
      visibility: "PRIVATE",
      acquisition_mode: "NONE",
      points_cost: 0,
      quantity: 1,
      max_per_user: 1,
    }));
    mockVoucherCount.mockResolvedValue(1);

    await expect(issueVoucherInTransaction(tx, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: ADMIN_ID,
      request_id: REQUEST_ID,
      now: NOW,
    })).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "VOUCHER_SOLD_OUT");
      return true;
    });
    expect(mockVoucherCount).toHaveBeenCalledWith({
      where: {
        package_id: PACKAGE_ID,
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT", "ADMIN"] },
      },
    });
    expect(mockVoucherCreate).not.toHaveBeenCalled();
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
    expect(mockVoucherCount).toHaveBeenNthCalledWith(2, {
      where: {
        package_id: PACKAGE_ID,
        user_id: USER_ID,
        issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"] },
      },
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

  it("phát hành ADDON khi anchor cũ nghỉ nhưng normalized target khác còn active", async () => {
    mockPackageFindUnique.mockResolvedValue(makePackage({
      voucher_type: "ADDON",
      addon_option_id: "inactive-anchor",
      addonOption: { is_active: false, gram_value: null, group: { is_active: true } },
      addonOptionScopes: [{ addon_option_id: "addon-ok" }],
    }));
    mockAddonOptionFindMany.mockResolvedValue([
      { id: "addon-ok", is_active: true, gram_value: null, group: { is_active: true } },
    ]);

    await issueVoucherInTransaction(makeTx(), {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "POINTS_EXCHANGE",
      now: NOW,
    });

    expect(mockVoucherCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        addonOptionScopes: { create: [{ addon_option_id: "addon-ok" }] },
      }),
    }));
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
