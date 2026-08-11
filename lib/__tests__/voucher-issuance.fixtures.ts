import { expect, vi } from "vitest";
import {
  VoucherIssuanceError,
  type VoucherIssuanceTransaction,
} from "@/lib/voucherIssuance";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
export const VOUCHER_ID = "33333333-3333-4333-8333-333333333333";
export const NOW = new Date("2026-08-11T10:00:00.000Z");

export const mockPackageFindUnique = vi.fn();
export const mockPackageFindMany = vi.fn();
export const mockVoucherCount = vi.fn();
export const mockVoucherCreate = vi.fn();
export const mockUserUpdateMany = vi.fn();
export const mockPointsLogCreate = vi.fn();
export const mockGrantFindUnique = vi.fn();
export const mockGrantCreate = vi.fn();

/** Build a complete voucher package snapshot for issuance tests. */
export function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: PACKAGE_ID,
    name: "Deal khai trương",
    voucher_type: "DISCOUNT",
    acquisition_mode: "POINTS_EXCHANGE",
    points_cost: 10,
    is_active: true,
    quantity: null,
    max_per_user: 1,
    expires_after_days: 30,
    discount_type: "FIXED",
    discount_value: 20_000,
    menu_item_id: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    promotion: null,
    ...overrides,
  };
}

/** Build the transaction adapter backed by shared issuance mocks. */
export function makeTx(): VoucherIssuanceTransaction {
  return {
    voucherPackage: {
      findUnique: (...args: unknown[]) => mockPackageFindUnique(...args),
    },
    voucher: {
      count: (...args: unknown[]) => mockVoucherCount(...args),
      create: (...args: unknown[]) => mockVoucherCreate(...args),
    },
    user: {
      updateMany: (...args: unknown[]) => mockUserUpdateMany(...args),
    },
    pointsLog: {
      create: (...args: unknown[]) => mockPointsLogCreate(...args),
    },
    voucherGrant: {
      findUnique: (...args: unknown[]) => mockGrantFindUnique(...args),
      create: (...args: unknown[]) => mockGrantCreate(...args),
    },
  };
}

/** Assert that voucher issuance fails with the expected stable reason. */
export function expectReason(error: unknown, reason: string): void {
  expect(error).toBeInstanceOf(VoucherIssuanceError);
  expect((error as VoucherIssuanceError).reason).toBe(reason);
}
