import { describe, expect, it, vi } from "vitest";

import {
  effectiveAdminGrantStatus,
  grantVoucherWithWarning,
  getAdminVoucherRecipientSummary,
  type AdminVoucherGrantDatabase,
} from "@/lib/adminVoucherGrant";
import {
  expectReason,
  makePackage,
  makeTx,
  mockPackageFindUnique,
  mockVoucherCount,
} from "@/lib/__tests__/voucher-issuance.fixtures";
import type { VoucherIssuanceDatabase, VoucherIssuanceTransaction } from "@/lib/voucherIssuance";

const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-11T10:00:00.000Z");

function makeDatabase(
  packageOverrides: Partial<{
    visibility: "PUBLIC" | "PRIVATE";
    max_per_user: number;
    quantity: number | null;
    expires_after_days: number | null;
    ends_at: Date | null;
    is_active: boolean;
  }> = {},
  counts = [3, 1, 2, 2],
): AdminVoucherGrantDatabase & { count: ReturnType<typeof vi.fn> } {
  const findUnique = vi.fn().mockResolvedValue({
    id: PACKAGE_ID,
    visibility: "PUBLIC" as const,
    max_per_user: 2,
    quantity: 5,
    expires_after_days: 3,
    ends_at: null,
    is_active: true,
    ...packageOverrides,
  });
  const count = vi.fn();
  counts.forEach((value) => count.mockResolvedValueOnce(value));
  return {
    voucherPackage: { findUnique },
    voucher: { count },
    count,
  } as AdminVoucherGrantDatabase & { count: ReturnType<typeof vi.fn> };
}

describe("admin voucher grant recipient summary", () => {
  it("keeps global stock, current/used history and self acquisition counts separate", async () => {
    const db = makeDatabase();
    const result = await getAdminVoucherRecipientSummary(db, PACKAGE_ID, USER_ID, NOW);

    expect(result?.summary).toEqual({
      self_acquisition_count: 2,
      self_acquisition_limit: 2,
      self_acquisition_remaining: 0,
      current_count: 1,
      used_count: 2,
      global_remaining: 2,
      grant_eligible: true,
      warning_reasons: [
        "ACTIVE_OR_RESERVED_VOUCHER_EXISTS",
        "SELF_ACQUISITION_LIMIT_REACHED",
      ],
      expiry_preview: new Date("2026-08-14T10:00:00.000Z"),
    });

    const selfCountArgs = db.count.mock.calls[3]?.[0] as { where: Record<string, unknown> };
    expect(selfCountArgs.where).toMatchObject({
      package_id: PACKAGE_ID,
      user_id: USER_ID,
      issued_via: { in: ["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"] },
    });
    const globalCountArgs = db.count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(globalCountArgs.where).toEqual({ package_id: PACKAGE_ID });
  });

  it("does not permanently apply a public self-acquisition limit to PRIVATE gifts", async () => {
    const db = makeDatabase({ visibility: "PRIVATE", max_per_user: 1 }, [4, 0, 0, 9]);
    const result = await getAdminVoucherRecipientSummary(db, PACKAGE_ID, USER_ID, NOW);

    expect(result?.summary).toMatchObject({
      self_acquisition_count: 9,
      self_acquisition_limit: null,
      self_acquisition_remaining: null,
      global_remaining: 1,
      grant_eligible: true,
      warning_reasons: [],
    });
  });

  it("reports paused, ended or sold-out packages as ineligible while preserving the expiry preview", async () => {
    const db = makeDatabase({
      quantity: 1,
      ends_at: new Date("2026-08-12T00:00:00.000Z"),
      is_active: false,
    }, [1, 0, 0, 0]);
    const result = await getAdminVoucherRecipientSummary(db, PACKAGE_ID, USER_ID, NOW);

    expect(result?.summary.grant_eligible).toBe(false);
    expect(result?.summary.global_remaining).toBe(0);
    expect(result?.summary.expiry_preview).toEqual(new Date("2026-08-12T00:00:00.000Z"));
  });
});

describe("admin voucher effective status", () => {
  it("projects expired ACTIVE rows without writing lifecycle state", () => {
    expect(effectiveAdminGrantStatus({ status: "ACTIVE", expires_at: new Date("2026-08-10T00:00:00.000Z") }, NOW)).toBe("EXPIRED");
    expect(effectiveAdminGrantStatus({ status: "RESERVED", expires_at: new Date("2026-08-10T00:00:00.000Z") }, NOW)).toBe("RESERVED");
    expect(effectiveAdminGrantStatus({ status: "ACTIVE", expires_at: new Date("2026-08-12T00:00:00.000Z") }, NOW)).toBe("ACTIVE");
  });
});

describe("admin voucher grant transaction workflow", () => {
  it("keeps warning and authoritative stock checks on one transaction client", async () => {
    vi.clearAllMocks();
    const tx = makeTx();
    const requestLookup = vi.fn().mockResolvedValue(null);
    tx.voucher.findUnique = requestLookup;
    mockPackageFindUnique.mockResolvedValue(makePackage({
      visibility: "PRIVATE",
      acquisition_mode: "NONE",
      quantity: 1,
      max_per_user: 1,
    }));
    mockVoucherCount
      .mockResolvedValueOnce(0) // summary global stock before the simulated interleaving
      .mockResolvedValueOnce(0) // current vouchers
      .mockResolvedValueOnce(0) // redeemed vouchers
      .mockResolvedValueOnce(0) // self acquisition allowance
      .mockResolvedValueOnce(1); // authoritative stock check sees the intervening issue
    const transactionClients: VoucherIssuanceTransaction[] = [];
    const transaction = vi.fn().mockImplementation(async (callback: (client: VoucherIssuanceTransaction) => Promise<unknown>) => {
      transactionClients.push(tx);
      return callback(tx);
    });
    const db = {
      voucherPackage: { findMany: vi.fn() },
      $transaction: transaction,
    } as unknown as VoucherIssuanceDatabase;
    const input = {
      user_id: USER_ID,
      package_id: PACKAGE_ID,
      performed_by: "44444444-4444-4444-8444-444444444444",
      request_id: "55555555-5555-4555-8555-555555555555",
      acknowledge_additional_gift: true,
      now: NOW,
    };

    await expect(grantVoucherWithWarning(db, input)).rejects.toSatisfy((error: unknown) => {
      expectReason(error, "VOUCHER_SOLD_OUT");
      return true;
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionClients).toEqual([tx]);
    expect(requestLookup).toHaveBeenCalled();
    expect(mockVoucherCount).toHaveBeenCalledTimes(5);
  });
});
