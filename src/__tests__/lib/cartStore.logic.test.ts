/**
 * Unit tests for computeFinalClientPrice — client-side pricing logic.
 *
 * Tests that PRODUCT voucher credit does NOT spill into addon prices.
 * Pure function, no React rendering needed.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

const { mockAddBusinessBreadcrumb } = vi.hoisted(() => ({
  mockAddBusinessBreadcrumb: vi.fn(),
}));

vi.mock("@/src/lib/observability", () => ({
  addBusinessBreadcrumb: (...args: unknown[]) => mockAddBusinessBreadcrumb(...args),
}));

import { computeFinalClientPrice, migrateCartState, useCartStore } from "@/src/lib/store/cartStore";
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

describe("Cart breadcrumbs ẩn danh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], selectedVoucherIds: [], isCartOpen: false });
  });

  it("ghi cart.add và cart.remove mà không gửi product ID", () => {
    const item = makeCartItem({ unitPrice: 50_000, addonsPrice: 0 });
    const { cartId: _cartId, ...newItem } = item;
    void _cartId;

    const cartId = useCartStore.getState().addItem(newItem);
    useCartStore.getState().removeItem(cartId);

    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("cart.add", {
      category: "latte",
      quantity: 1,
    });
    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("cart.remove", {
      remaining_items: 0,
    });
  });

  it("ghi voucher.apply và voucher.remove mà không gửi voucher ID", () => {
    const item = makeCartItem({ unitPrice: 50_000, addonsPrice: 0 });
    useCartStore.setState({ items: [item] });

    useCartStore.getState().applyProductVoucher(item.cartId, "voucher-secret", 30_000);
    useCartStore.getState().removeProductVoucher(item.cartId);

    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("voucher.apply", {
      voucher_type: "PRODUCT",
    });
    expect(mockAddBusinessBreadcrumb).toHaveBeenCalledWith("voucher.remove", {
      voucher_type: "PRODUCT",
    });
  });
});

describe("Cart persisted-state privacy migration", () => {
  it("giữ món nhưng xoá voucher legacy và phục hồi giá trước voucher", () => {
    const item = makeCartItem({
      unitPrice: 55_000,
      addonsPrice: 0,
      productVoucherDiscountVnd: 50_000,
      addonVouchers: [{ voucherId: "legacy-addon-id", addonOptionId: "addon-kem", discountVnd: 15_000 }],
    });
    const migrated = migrateCartState(
      { items: [{ ...item, productVoucherId: "legacy-product-id" }], selectedVoucherIds: ["legacy-discount-id"] },
      2,
    );

    const migratedItems = migrated.items ?? [];
    expect(migratedItems).toHaveLength(1);
    expect(migratedItems[0].clientPriceVnd).toBe(55_000);
    expect(migratedItems[0].productVoucherId).toBeUndefined();
    expect(migratedItems[0].productVoucherDiscountVnd).toBeUndefined();
    expect(migratedItems[0].addonVouchers).toEqual([]);
    expect(migrated.selectedVoucherIds).toEqual([]);
  });
});
