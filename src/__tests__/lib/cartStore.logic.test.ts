/**
 * Unit tests for computeFinalClientPrice — client-side pricing logic.
 *
 * Tests that PRODUCT voucher credit does NOT spill into addon prices.
 * Pure function, no React rendering needed.
 */

import { describe, it, expect } from "vitest";
import { computeFinalClientPrice } from "@/src/lib/store/cartStore";
import type { CartItem } from "@/src/lib/types/cart";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Tạo CartItem tối thiểu cho test */
function makeCartItem(overrides: {
  unitPrice: number;
  addonsPrice: number;
  productVoucherDiscountVnd?: number;
  addonVouchers?: Array<{ voucherId: string; addonOptionId: string; discountVnd: number }>;
}): CartItem {
  return {
    cartId: "cart-001",
    menuItemId: "item-001",
    name: "Trà Xanh Sữa",
    category: "latte",
    imageUrl: null,
    size: "SMALL",
    unitPrice: overrides.unitPrice,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    quantityMap: {},
    addonsPrice: overrides.addonsPrice,
    addonPrices: {},
    quantityAddonOptions: [],
    clientPriceVnd: overrides.unitPrice,
    originalClientPriceVnd: overrides.unitPrice,
    productVoucherId: overrides.productVoucherDiscountVnd ? "pv-001" : undefined,
    productVoucherDiscountVnd: overrides.productVoucherDiscountVnd,
    addonVouchers: overrides.addonVouchers,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeFinalClientPrice — PRODUCT credit không spill vào addon", () => {
  it("Credit 60k, drink 70k, addon 20k → drink trả 10k, addon vẫn 20k, total 30k", () => {
    const item = makeCartItem({
      unitPrice: 90000, // 70k drink + 20k addon
      addonsPrice: 20000,
      productVoucherDiscountVnd: 60000,
    });

    const result = computeFinalClientPrice(item);

    // drink = 90k - 20k = 70k, credit 60k → drink trả 10k
    // addon = 20k (không bị spill)
    // total = 10k + 20k = 30k
    expect(result).toBe(30000);
  });

  it("Credit 80k > drink 70k → drink = 0, addon vẫn 20k, total 20k (không spill)", () => {
    const item = makeCartItem({
      unitPrice: 90000, // 70k drink + 20k addon
      addonsPrice: 20000,
      productVoucherDiscountVnd: 80000,
    });

    const result = computeFinalClientPrice(item);

    // drink = 70k, credit 80k → drink = 0, remaining 10k KHÔNG spill vào addon
    // addon = 20k (nguyên)
    // total = 0 + 20k = 20k
    expect(result).toBe(20000);
  });

  it("Credit 0 → drink + addon nguyên giá", () => {
    const item = makeCartItem({
      unitPrice: 90000,
      addonsPrice: 20000,
      productVoucherDiscountVnd: 0,
    });

    const result = computeFinalClientPrice(item);
    expect(result).toBe(90000);
  });

  it("ADDON voucher discount áp riêng trên addonsPrice, không bị ảnh hưởng bởi PRODUCT", () => {
    const item = makeCartItem({
      unitPrice: 90000, // 70k drink + 20k addon
      addonsPrice: 20000,
      productVoucherDiscountVnd: 70000, // covers entire drink
      addonVouchers: [{ voucherId: "av-001", addonOptionId: "addon-kem", discountVnd: 15000 }],
    });

    const result = computeFinalClientPrice(item);

    // drink = 0 (fully covered)
    // addon = 20k - 15k (addon voucher) = 5k
    // PRODUCT remaining 0 (80k credit capped at 70k drink), no spill
    // total = 0 + 5k = 5k
    expect(result).toBe(5000);
  });
});
