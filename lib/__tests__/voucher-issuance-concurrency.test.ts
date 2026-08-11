import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureAutoGrantedVouchers,
  issueVoucher,
  type VoucherIssuanceDatabase,
  type VoucherIssuanceTransaction,
} from "@/lib/voucherIssuance";
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
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(mockPackageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ acquisition_mode: "AUTO_GRANT", is_active: true }),
        orderBy: { id: "asc" },
      }),
    );
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
});
