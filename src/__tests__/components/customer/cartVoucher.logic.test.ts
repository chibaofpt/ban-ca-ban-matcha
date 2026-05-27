/**
 * Tests for the logic of applying vouchers to the customer cart.
 *
 * Tests pure functions extracted from CartDrawer / cartStore:
 *
 *  - buildOrderPayloadWithVoucher  → creates createOrder payload with voucher_id attached
 *  - filterEligibleVouchers        → filters ACTIVE vouchers that match the cart
 *  - computeDiscountedTotal        → computes preview total after DISCOUNT voucher
 *  - validateVoucherForCart        → checks if a selected voucher is still valid to use
 */

import { describe, it, expect } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";

// ── Types ─────────────────────────────────────────────────────────────────────

type VoucherType = "DISCOUNT" | "PRODUCT" | "ADDON";
type VoucherStatus = "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";

interface MyVoucher {
  id: string;
  qr_token: string;
  voucher_type: VoucherType;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  size: "M" | "L" | "XL" | null;
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  status: VoucherStatus;
  expires_at: string | null;
  package: { name: string; description: string | null; points_cost: number };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
}

// ── Pure functions to be implemented in the actual component ──────────────────

/**
 * Builds the `voucher_id` + `items` part of the createOrder payload.
 * The discount voucher is attached at order level.
 */
function buildOrderPayloadWithVoucher(
  cartItems: CartItem[],
  discountVoucherId: string | null
): {
  items: { menu_item_id: string; quantity: number; client_price_vnd: number }[];
  voucher_id?: string;
} {
  const base = {
    items: cartItems.map((c) => ({
      menu_item_id: c.menuItemId,
      quantity: c.quantity,
      client_price_vnd: c.clientPriceVnd,
    })),
  };
  if (discountVoucherId) {
    return { ...base, voucher_id: discountVoucherId };
  }
  return base;
}

/**
 * Filters the user's ACTIVE vouchers to only return DISCOUNT type vouchers
 * that are valid (not expired, not RESERVED/REDEEMED).
 */
function filterEligibleDiscountVouchers(vouchers: MyVoucher[]): MyVoucher[] {
  const now = new Date();
  return vouchers.filter((v) => {
    if (v.voucher_type !== "DISCOUNT") return false;
    if (v.status !== "ACTIVE") return false;
    if (v.expires_at !== null && new Date(v.expires_at) < now) return false;
    return true;
  });
}

/**
 * Computes a client-side preview of the total after applying a DISCOUNT voucher.
 * Server will revalidate — this is display-only.
 */
function computeDiscountedTotal(
  subtotal: number,
  voucher: MyVoucher | null
): number {
  if (!voucher || voucher.voucher_type !== "DISCOUNT") return subtotal;

  if (voucher.discount_type === "PERCENT") {
    const discount = Math.round(subtotal * (voucher.discount_value! / 100));
    return Math.max(0, subtotal - discount);
  }

  if (voucher.discount_type === "FIXED") {
    return Math.max(0, subtotal - voucher.discount_value!);
  }

  return subtotal;
}

/**
 * Validates that the selected voucher is still usable at checkout time.
 * Returns null if valid, or an error message string if not.
 */
function validateVoucherForCheckout(voucher: MyVoucher | null): string | null {
  if (!voucher) return null;
  if (voucher.status !== "ACTIVE") {
    return "Voucher này đã được sử dụng hoặc không còn hiệu lực.";
  }
  if (voucher.expires_at !== null && new Date(voucher.expires_at) < new Date()) {
    return "Voucher này đã hết hạn.";
  }
  return null;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItemId: "item-latte-aaa",
    name: "Trà Xanh Sữa",
    category: "latte",
    imageUrl: null,
    size: "L",
    unitPrice: 55000,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    quantityMap: {},
    addonsPrice: 0,
    quantityAddonOptions: [],
    clientPriceVnd: 55000,
    originalClientPriceVnd: 55000,
    ...overrides,
  };
}

function makeVoucher(overrides: Partial<MyVoucher> = {}): MyVoucher {
  return {
    id: "voucher-1",
    qr_token: "qr-abc",
    voucher_type: "DISCOUNT",
    discount_type: "PERCENT",
    discount_value: 10,
    menu_item_id: null,
    size: null,
    addon_option_id: null,
    covered_price_vnd: null,
    status: "ACTIVE",
    expires_at: null,
    package: { name: "Giảm 10%", description: null, points_cost: 50 },
    menuItem: null,
    addonOption: null,
    ...overrides,
  };
}

// ── buildOrderPayloadWithVoucher ──────────────────────────────────────────────

describe("buildOrderPayloadWithVoucher", () => {
  it("không có voucher → payload không có voucher_id", () => {
    const items = [makeCartItem()];
    const payload = buildOrderPayloadWithVoucher(items, null);

    expect("voucher_id" in payload).toBe(false);
    expect(payload.items).toHaveLength(1);
  });

  it("có discountVoucherId → payload chứa voucher_id", () => {
    const items = [makeCartItem()];
    const payload = buildOrderPayloadWithVoucher(items, "voucher-abc");

    expect(payload.voucher_id).toBe("voucher-abc");
  });

  it("items được map đúng: menu_item_id, quantity, client_price_vnd", () => {
    const items = [
      makeCartItem({ menuItemId: "item-A", quantity: 2, clientPriceVnd: 110000 }),
    ];
    const payload = buildOrderPayloadWithVoucher(items, null);

    expect(payload.items[0].menu_item_id).toBe("item-A");
    expect(payload.items[0].quantity).toBe(2);
    expect(payload.items[0].client_price_vnd).toBe(110000);
  });

  it("nhiều items → tất cả được map", () => {
    const items = [
      makeCartItem({ menuItemId: "item-A", clientPriceVnd: 55000 }),
      makeCartItem({ menuItemId: "item-B", clientPriceVnd: 70000, quantity: 2 }),
    ];
    const payload = buildOrderPayloadWithVoucher(items, "voucher-xyz");

    expect(payload.items).toHaveLength(2);
    expect(payload.voucher_id).toBe("voucher-xyz");
  });
});

// ── filterEligibleDiscountVouchers ────────────────────────────────────────────

describe("filterEligibleDiscountVouchers", () => {
  it("chỉ trả về voucher DISCOUNT + ACTIVE + chưa hết hạn", () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 7 * 24 * 3600000).toISOString();

    const vouchers: MyVoucher[] = [
      makeVoucher({ id: "v1", voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: futureDate }),
      makeVoucher({ id: "v2", voucher_type: "PRODUCT", status: "ACTIVE" }),
      makeVoucher({ id: "v3", voucher_type: "DISCOUNT", status: "REDEEMED" }),
      makeVoucher({ id: "v4", voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: null }),
    ];

    const result = filterEligibleDiscountVouchers(vouchers);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(["v1", "v4"]);
  });

  it("voucher DISCOUNT đã hết hạn bị loại", () => {
    const pastDate = new Date(Date.now() - 1000).toISOString(); // 1 giây trước
    const vouchers = [makeVoucher({ expires_at: pastDate })];

    const result = filterEligibleDiscountVouchers(vouchers);

    expect(result).toHaveLength(0);
  });

  it("trả về mảng rỗng khi không có voucher nào hợp lệ", () => {
    const vouchers: MyVoucher[] = [
      makeVoucher({ voucher_type: "PRODUCT" }),
      makeVoucher({ status: "REDEEMED" }),
    ];

    expect(filterEligibleDiscountVouchers(vouchers)).toHaveLength(0);
  });

  it("expires_at = null nghĩa là vô thời hạn → không bị lọc", () => {
    const vouchers = [makeVoucher({ expires_at: null })];
    expect(filterEligibleDiscountVouchers(vouchers)).toHaveLength(1);
  });
});

// ── computeDiscountedTotal ────────────────────────────────────────────────────

describe("computeDiscountedTotal", () => {
  it("không có voucher → giá không thay đổi", () => {
    expect(computeDiscountedTotal(100000, null)).toBe(100000);
  });

  it("PERCENT 10% → giảm đúng 10%", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: 10 });
    expect(computeDiscountedTotal(100000, v)).toBe(90000);
  });

  it("PERCENT 50% trên 55000 → 27500", () => {
    const v = makeVoucher({ discount_type: "PERCENT", discount_value: 50 });
    expect(computeDiscountedTotal(55000, v)).toBe(27500);
  });

  it("FIXED 20000 → giảm 20000", () => {
    const v = makeVoucher({ discount_type: "FIXED", discount_value: 20000 });
    expect(computeDiscountedTotal(100000, v)).toBe(80000);
  });

  it("FIXED lớn hơn subtotal → tổng = 0 (không âm)", () => {
    const v = makeVoucher({ discount_type: "FIXED", discount_value: 200000 });
    expect(computeDiscountedTotal(50000, v)).toBe(0);
  });

  it("voucher type PRODUCT → không thay đổi tổng (không phải DISCOUNT)", () => {
    const v = makeVoucher({ voucher_type: "PRODUCT", discount_type: null, discount_value: null });
    expect(computeDiscountedTotal(100000, v)).toBe(100000);
  });
});

// ── validateVoucherForCheckout ─────────────────────────────────────────────────

describe("validateVoucherForCheckout", () => {
  it("null voucher → không có lỗi", () => {
    expect(validateVoucherForCheckout(null)).toBeNull();
  });

  it("ACTIVE voucher, chưa hết hạn → không có lỗi", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 3600000).toISOString();
    const v = makeVoucher({ status: "ACTIVE", expires_at: futureDate });
    expect(validateVoucherForCheckout(v)).toBeNull();
  });

  it("ACTIVE voucher, expires_at = null → không có lỗi", () => {
    const v = makeVoucher({ status: "ACTIVE", expires_at: null });
    expect(validateVoucherForCheckout(v)).toBeNull();
  });

  it("REDEEMED voucher → trả về thông báo lỗi", () => {
    const v = makeVoucher({ status: "REDEEMED" });
    const error = validateVoucherForCheckout(v);
    expect(error).not.toBeNull();
    expect(error).toContain("sử dụng");
  });

  it("EXPIRED voucher theo status → trả về thông báo lỗi", () => {
    const v = makeVoucher({ status: "EXPIRED" });
    const error = validateVoucherForCheckout(v);
    expect(error).not.toBeNull();
  });

  it("ACTIVE nhưng expires_at đã qua → trả về 'đã hết hạn'", () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const v = makeVoucher({ status: "ACTIVE", expires_at: pastDate });
    const error = validateVoucherForCheckout(v);
    expect(error).toContain("hết hạn");
  });
});
