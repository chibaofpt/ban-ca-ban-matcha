/**
 * Unit tests for lib/vouchers.ts — pure voucher business logic.
 * No DB, no Prisma — all pure functions.
 */

import { describe, it, expect } from "vitest";
import {
  assertVoucherUsable,
  calcDiscountVoucher,
  calcProductVoucherSurplusPoints,
  findAddonVoucherDiscount,
  calcPointsEarned,
  VoucherError,
  type ResolvedOrderItem,
} from "@/lib/vouchers";
import type { Voucher } from "@prisma/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "user-aaa";
const OTHER_USER_ID = "user-bbb";
const ADDON_KEM_ID = "addon-kem-111";
const ADDON_DA_DUA_ID = "addon-dadua-222";

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: "voucher-001",
    user_id: USER_ID,
    package_id: "pkg-001",
    qr_token: "qr-abc",
    voucher_type: "DISCOUNT",
    discount_type: "PERCENT",
    discount_value: 20,
    menu_item_id: null,
    size: null,
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: null,
    status: "ACTIVE",
    used_channel: null,
    expires_at: null,
    redeemed_at: null,
    redeemed_by: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeOrderItem(
  addons: { addon_option_id: string; quantity: number; unit_price_vnd: number }[]
): ResolvedOrderItem {
  return {
    menu_item_id: "item-001",
    quantity: 1,
    size: "L",
    unit_price_vnd: 55000,
    addons_price_vnd: addons.reduce((s, a) => s + a.unit_price_vnd * a.quantity, 0),
    line_total: 55000 + addons.reduce((s, a) => s + a.unit_price_vnd * a.quantity, 0),
    product_voucher_id: null,
    resolvedAddons: addons,
  };
}

// ── assertVoucherUsable ───────────────────────────────────────────────────────

describe("assertVoucherUsable", () => {
  it("passes for a valid ACTIVE voucher belonging to the user", () => {
    const v = makeVoucher();
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).not.toThrow();
  });

  it("throws NOT_FOUND when voucher is null", () => {
    expect(() => assertVoucherUsable(null, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    );
  });

  it("throws NOT_FOUND when voucher belongs to another user", () => {
    const v = makeVoucher({ user_id: OTHER_USER_ID });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" })
    );
  });

  it("throws VOUCHER_REDEEMED when status is REDEEMED", () => {
    const v = makeVoucher({ status: "REDEEMED" });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "VOUCHER_REDEEMED" })
    );
  });

  it("throws VOUCHER_EXPIRED when status is EXPIRED", () => {
    const v = makeVoucher({ status: "EXPIRED" });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "VOUCHER_EXPIRED" })
    );
  });

  it("throws VOUCHER_EXPIRED when status is REFUNDED", () => {
    const v = makeVoucher({ status: "REFUNDED" });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "VOUCHER_EXPIRED" })
    );
  });

  it("throws CONFLICT when status is RESERVED", () => {
    const v = makeVoucher({ status: "RESERVED" });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "CONFLICT" })
    );
  });

  it("throws VOUCHER_EXPIRED when expires_at is in the past", () => {
    const v = makeVoucher({ expires_at: new Date("2020-01-01") });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "VOUCHER_EXPIRED" })
    );
  });

  it("passes when expires_at is in the future", () => {
    const v = makeVoucher({ expires_at: new Date("2099-01-01") });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).not.toThrow();
  });

  it("throws VALIDATION_ERROR when voucher type does not match expected", () => {
    const v = makeVoucher({ voucher_type: "PRODUCT" });
    expect(() => assertVoucherUsable(v, USER_ID, "DISCOUNT")).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" })
    );
  });

  it("passes PRODUCT voucher check", () => {
    const v = makeVoucher({ voucher_type: "PRODUCT" });
    expect(() => assertVoucherUsable(v, USER_ID, "PRODUCT")).not.toThrow();
  });

  it("passes ADDON voucher check", () => {
    const v = makeVoucher({ voucher_type: "ADDON" });
    expect(() => assertVoucherUsable(v, USER_ID, "ADDON")).not.toThrow();
  });
});

// ── calcDiscountVoucher ───────────────────────────────────────────────────────

describe("calcDiscountVoucher", () => {
  it("PERCENT: floor(69000 × 20%) = 13800", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: 20 });
    expect(calcDiscountVoucher(v, 69000)).toBe(13800);
  });

  it("PERCENT: floors fractional result (69000 × 33% = 22770)", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: 33 });
    expect(calcDiscountVoucher(v, 69000)).toBe(22770);
  });

  it("PERCENT: 100% off = entire subtotal", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: 100 });
    expect(calcDiscountVoucher(v, 69000)).toBe(69000);
  });

  it("FIXED: deducts exact value when less than subtotal", () => {
    const v = makeVoucher({ discount_type: "FIXED", discount_value: 10000 });
    expect(calcDiscountVoucher(v, 69000)).toBe(10000);
  });

  it("FIXED: capped at subtotal when discount_value > subtotal", () => {
    const v = makeVoucher({ discount_type: "FIXED", discount_value: 200000 });
    expect(calcDiscountVoucher(v, 69000)).toBe(69000);
  });

  it("FIXED: equals subtotal when exactly equal (total becomes 0)", () => {
    const v = makeVoucher({ discount_type: "FIXED", discount_value: 69000 });
    expect(calcDiscountVoucher(v, 69000)).toBe(69000);
  });

  it("returns 0 when discount_value is null", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: null });
    expect(calcDiscountVoucher(v, 69000)).toBe(0);
  });

  it("returns 0 when discount_type is null", () => {
    const v = makeVoucher({ discount_type: null, discount_value: 10000 });
    expect(calcDiscountVoucher(v, 69000)).toBe(0);
  });
});

// ── calcProductVoucherSurplusPoints ───────────────────────────────────────────

describe("calcProductVoucherSurplusPoints", () => {
  it("returns surplus points when covered > actual", () => {
    // covered=65000, actual=55000 → surplus=10000 → 1 point
    expect(calcProductVoucherSurplusPoints(65000, 55000)).toBe(1);
  });

  it("returns 0 when actual === covered (no surplus)", () => {
    expect(calcProductVoucherSurplusPoints(65000, 65000)).toBe(0);
  });

  it("returns 0 when actual > covered (customer paid more than covered — normal case)", () => {
    expect(calcProductVoucherSurplusPoints(65000, 75000)).toBe(0);
  });

  it("floors partial points (surplus 15000 → 1 point, not 1.5)", () => {
    expect(calcProductVoucherSurplusPoints(70000, 55000)).toBe(1);
  });

  it("returns 2 points for 20000 surplus", () => {
    expect(calcProductVoucherSurplusPoints(85000, 65000)).toBe(2);
  });

  it("returns 0 for surplus < 10000 (below 1 point threshold)", () => {
    expect(calcProductVoucherSurplusPoints(65000, 60000)).toBe(0); // 5000 surplus
  });

  it("handles large surplus correctly", () => {
    expect(calcProductVoucherSurplusPoints(200000, 50000)).toBe(15); // floor(150000 / 10000)
  });
});

// ── findAddonVoucherDiscount ──────────────────────────────────────────────────

describe("findAddonVoucherDiscount", () => {
  it("returns unit_price_vnd for first matching item with the addon", () => {
    const items: ResolvedOrderItem[] = [
      makeOrderItem([
        { addon_option_id: ADDON_KEM_ID, quantity: 1, unit_price_vnd: 8000 },
      ]),
    ];
    expect(findAddonVoucherDiscount(items, ADDON_KEM_ID)).toBe(8000);
  });

  it("returns 0 when no item has the target addon", () => {
    const items: ResolvedOrderItem[] = [
      makeOrderItem([
        { addon_option_id: ADDON_DA_DUA_ID, quantity: 1, unit_price_vnd: 5000 },
      ]),
    ];
    expect(findAddonVoucherDiscount(items, ADDON_KEM_ID)).toBe(0);
  });

  it("applies to FIRST matching item only (3 items, 2 have kem → discounts first)", () => {
    const items: ResolvedOrderItem[] = [
      makeOrderItem([{ addon_option_id: ADDON_KEM_ID, quantity: 1, unit_price_vnd: 8000 }]),
      makeOrderItem([{ addon_option_id: ADDON_KEM_ID, quantity: 1, unit_price_vnd: 8000 }]),
      makeOrderItem([]),
    ];
    // Should return price from FIRST item only, not sum of all
    expect(findAddonVoucherDiscount(items, ADDON_KEM_ID)).toBe(8000);
  });

  it("returns 0 when items array is empty", () => {
    expect(findAddonVoucherDiscount([], ADDON_KEM_ID)).toBe(0);
  });

  it("skips items without addons and finds match in later item", () => {
    const items: ResolvedOrderItem[] = [
      makeOrderItem([]), // no addons
      makeOrderItem([{ addon_option_id: ADDON_KEM_ID, quantity: 1, unit_price_vnd: 8000 }]),
    ];
    expect(findAddonVoucherDiscount(items, ADDON_KEM_ID)).toBe(8000);
  });

  it("handles item with multiple addons — finds by addon_option_id", () => {
    const items: ResolvedOrderItem[] = [
      makeOrderItem([
        { addon_option_id: ADDON_DA_DUA_ID, quantity: 1, unit_price_vnd: 5000 },
        { addon_option_id: ADDON_KEM_ID, quantity: 1, unit_price_vnd: 8000 },
      ]),
    ];
    expect(findAddonVoucherDiscount(items, ADDON_KEM_ID)).toBe(8000);
    expect(findAddonVoucherDiscount(items, ADDON_DA_DUA_ID)).toBe(5000);
  });
});

// ── calcPointsEarned ──────────────────────────────────────────────────────────

describe("calcPointsEarned", () => {
  it("floor(69000 / 10000) = 6", () => {
    expect(calcPointsEarned(69000)).toBe(6);
  });

  it("floor(10000 / 10000) = 1", () => {
    expect(calcPointsEarned(10000)).toBe(1);
  });

  it("floor(9999 / 10000) = 0 (below threshold)", () => {
    expect(calcPointsEarned(9999)).toBe(0);
  });

  it("floor(100000 / 10000) = 10", () => {
    expect(calcPointsEarned(100000)).toBe(10);
  });

  it("0 vnd = 0 points", () => {
    expect(calcPointsEarned(0)).toBe(0);
  });

  it("floors fractional results", () => {
    expect(calcPointsEarned(15999)).toBe(1); // floor(1.5999) = 1
  });
});
