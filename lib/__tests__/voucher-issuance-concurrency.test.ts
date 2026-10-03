import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueVoucher,
  VoucherIssuanceError,
  type VoucherIssuanceDatabase,
  type VoucherIssuanceTransaction,
} from "@/lib/vouchers/voucherIssuance";
import { ensureAutoGrantedVouchers } from "@/lib/vouchers/autoGrantVouchers";
import {
  NOW,
  PACKAGE_ID,
  USER_ID,
  VOUCHER_ID,
  makePackage,
  makeTx,
  mockGrantCreate,
  mockGrantFindUnique,
  mockPackageFindMany,
  mockPackageFindUnique,
  mockMenuItemFindMany,
  mockPowderFindMany,
  mockMilkTypeFindMany,
  mockAddonOptionFindMany,
  mockVoucherCount,
  mockVoucherCreate,
} from "@/lib/__tests__/voucher-issuance.fixtures";

describe("Serializable transaction và lazy AUTO_GRANT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPackageFindUnique.mockResolvedValue(
      makePackage({ acquisition_mode: "AUTO_GRANT", points_cost: 0 }),
    );
    mockVoucherCount.mockResolvedValue(0);
    mockVoucherCreate.mockResolvedValue({ id: VOUCHER_ID, qr_token: "voucher-token" });
    mockGrantFindUnique.mockResolvedValue(null);
    mockGrantCreate.mockResolvedValue({ id: "grant-id" });
    mockMenuItemFindMany.mockResolvedValue([]);
    mockPowderFindMany.mockResolvedValue([]);
    mockMilkTypeFindMany.mockResolvedValue([]);
    mockAddonOptionFindMany.mockResolvedValue([]);
  });

  it("retry tối đa khi Prisma trả P2034 và dùng isolation Serializable", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(
        async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
      );
    const db = { $transaction: transaction } as unknown as VoucherIssuanceDatabase;

    await issueVoucher(db, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "AUTO_GRANT",
      now: NOW,
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("lazy AUTO_GRANT cấp mọi package active theo thứ tự ID và không làm fail toàn luồng khi đã cấp", async () => {
    mockPackageFindMany.mockResolvedValue([{ id: "bbbb" }, { id: "aaaa" }]);
    mockGrantFindUnique.mockResolvedValue({ voucher_id: VOUCHER_ID });
    const transaction = vi.fn().mockImplementation(
      async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
    );
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    const result = await ensureAutoGrantedVouchers(db, USER_ID, NOW);

    expect(result).toEqual({ granted: 0, already_granted: 2 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mockPackageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ acquisition_mode: "AUTO_GRANT", is_active: true }),
        orderBy: { id: "asc" },
      }),
    );
  });

  it("lazy AUTO_GRANT không mở transaction khi không có package", async () => {
    mockPackageFindMany.mockResolvedValue([]);
    const transaction = vi.fn();
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).resolves.toEqual({
      granted: 0,
      already_granted: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(["P2034", "P2002"])(
    "lazy AUTO_GRANT retry đúng ba lần cho %s rồi ném lại cùng lỗi terminal",
    async (code) => {
      mockPackageFindMany.mockResolvedValue([{ id: PACKAGE_ID }]);
      const terminalError = { code };
      const transaction = vi.fn().mockRejectedValue(terminalError);
      const db = {
        voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
        $transaction: transaction,
      } as unknown as VoucherIssuanceDatabase;

      await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).rejects.toBe(terminalError);
      expect(transaction).toHaveBeenCalledTimes(3);
    },
  );

  it("lazy AUTO_GRANT ném nguyên lỗi bất ngờ và không retry", async () => {
    mockPackageFindMany.mockResolvedValue([{ id: PACKAGE_ID }]);
    const unexpectedError = new Error("unexpected");
    const transaction = vi.fn().mockRejectedValue(unexpectedError);
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).rejects.toBe(unexpectedError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    "VOUCHER_SOLD_OUT",
    "VOUCHER_LIMIT_REACHED",
    "VOUCHER_PACKAGE_EXPIRED",
    "NOT_FOUND",
    "TARGET_UNAVAILABLE",
    "NO_ACTIVE_QUALIFIER",
    "NO_ACTIVE_REWARD",
    "NO_ACTIVE_CONFIGURATION",
  ])("lazy AUTO_GRANT bỏ qua đúng lỗi allowlist %s", async (reason) => {
    mockPackageFindMany.mockResolvedValue([{ id: PACKAGE_ID }]);
    mockPackageFindUnique.mockRejectedValue(new VoucherIssuanceError(reason, "skip"));
    const transaction = vi.fn().mockImplementation(
      async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
    );
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).resolves.toEqual({
      granted: 0,
      already_granted: 0,
    });
  });

  it("lazy AUTO_GRANT fail-fast với VoucherIssuanceError ngoài allowlist", async () => {
    mockPackageFindMany.mockResolvedValue([{ id: PACKAGE_ID }]);
    const terminalError = new VoucherIssuanceError("INSUFFICIENT_POINTS", "terminal");
    mockPackageFindUnique.mockRejectedValue(terminalError);
    const transaction = vi.fn().mockImplementation(
      async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(makeTx()),
    );
    const db = {
      voucherPackage: { findMany: (...args: unknown[]) => mockPackageFindMany(...args) },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;

    await expect(ensureAutoGrantedVouchers(db, USER_ID, NOW)).rejects.toBe(terminalError);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("FREE_CLAIM đồng thời bị unique race vẫn trả idempotent", async () => {
    const db = {
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
    } as unknown as VoucherIssuanceDatabase;

    await expect(
      issueVoucher(db, {
        user_id: USER_ID,
        package_id: PACKAGE_ID,
        source: "FREE_CLAIM",
        now: NOW,
      }),
    ).resolves.toEqual({ id: "", already_granted: true });
  });

  it("ADMIN unique race retry đọc request đã commit và trả lại gift hiện có", async () => {
    const replayTx = makeTx();
    replayTx.voucher.findUnique = vi.fn().mockResolvedValue({
      id: VOUCHER_ID,
      qr_token: "voucher-token",
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      issued_via: "ADMIN",
      issuing_admin_id: "44444444-4444-4444-8444-444444444444",
      manual_request_id: "55555555-5555-4555-8555-555555555555",
      voucher_type: "DISCOUNT",
      status: "ACTIVE",
      expires_at: null,
      redeemed_at: null,
    });
    const transaction = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2002" })
      .mockImplementationOnce(async (callback: (tx: VoucherIssuanceTransaction) => Promise<unknown>) => callback(replayTx));
    const db = { $transaction: transaction } as unknown as VoucherIssuanceDatabase;

    await expect(issueVoucher(db, {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      source: "ADMIN",
      performed_by: "44444444-4444-4444-8444-444444444444",
      request_id: "55555555-5555-4555-8555-555555555555",
      now: NOW,
    })).resolves.toMatchObject({ id: VOUCHER_ID, already_granted: true });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
