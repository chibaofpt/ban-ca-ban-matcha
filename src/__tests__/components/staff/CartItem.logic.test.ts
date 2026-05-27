import { describe, it, expect } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";

// ── Pure cart manipulation logic mirroring StaffOrdersPage ──────────────────

/** Mirror handleChangeQuantity từ StaffOrdersPage */
function changeQuantity(cart: CartItem[], cartId: string, newQty: number): CartItem[] {
  return cart.map((c) =>
    c.cartId === cartId ? { ...c, quantity: Math.max(1, newQty) } : c
  );
}

/** Mirror handleRemove từ StaffOrdersPage */
function removeItem(cart: CartItem[], cartId: string): CartItem[] {
  return cart.filter((c) => c.cartId !== cartId);
}

/** Mirror handleAddToCart — always push, never merge */
function addToCart(cart: CartItem[], newItem: CartItem): CartItem[] {
  return [...cart, newItem];
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItemId: "item-1",
    name: "Matcha Latte",
    category: "latte",
    imageUrl: null,
    size: "L",
    unitPrice: 55000,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: ["opt-cow"],
    quantityMap: {},
    quantityAddonOptions: [],
    addonsPrice: 0,
    clientPriceVnd: 55000,
    originalClientPriceVnd: 55000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("addToCart — không merge", () => {
  it("add 2 item cùng config → 2 hàng riêng", () => {
    const item1 = makeCartItem({ cartId: "c1" });
    const item2 = makeCartItem({ cartId: "c2" });
    const cart = addToCart(addToCart([], item1), item2);
    expect(cart).toHaveLength(2);
  });

  it("add item khác config → 2 hàng riêng", () => {
    const item1 = makeCartItem({ cartId: "c1", size: "M", unitPrice: 45000 });
    const item2 = makeCartItem({ cartId: "c2", size: "L", unitPrice: 55000 });
    const cart = addToCart(addToCart([], item1), item2);
    expect(cart).toHaveLength(2);
    expect(cart[0].size).toBe("M");
    expect(cart[1].size).toBe("L");
  });
});

describe("changeQuantity", () => {
  it("tăng quantity lên 3", () => {
    const cart = [makeCartItem({ cartId: "c1", quantity: 1 })];
    const updated = changeQuantity(cart, "c1", 3);
    expect(updated[0].quantity).toBe(3);
  });

  it("không thể giảm xuống dưới 1", () => {
    const cart = [makeCartItem({ cartId: "c1", quantity: 1 })];
    const updated = changeQuantity(cart, "c1", 0);
    expect(updated[0].quantity).toBe(1);
  });

  it("chỉ update đúng cartId, item khác không đổi", () => {
    const cart = [
      makeCartItem({ cartId: "c1", quantity: 1 }),
      makeCartItem({ cartId: "c2", quantity: 1 }),
    ];
    const updated = changeQuantity(cart, "c1", 5);
    expect(updated[0].quantity).toBe(5);
    expect(updated[1].quantity).toBe(1);
  });
});

describe("removeItem", () => {
  it("xoá đúng item theo cartId", () => {
    const cart = [
      makeCartItem({ cartId: "c1" }),
      makeCartItem({ cartId: "c2" }),
    ];
    const updated = removeItem(cart, "c1");
    expect(updated).toHaveLength(1);
    expect(updated[0].cartId).toBe("c2");
  });

  it("xoá item không tồn tại → cart không thay đổi", () => {
    const cart = [makeCartItem({ cartId: "c1" })];
    const updated = removeItem(cart, "not-exist");
    expect(updated).toHaveLength(1);
  });
});

describe("total calculation", () => {
  it("tổng = sum(unitPrice × quantity)", () => {
    const cart = [
      makeCartItem({ cartId: "c1", unitPrice: 55000, quantity: 2 }),
      makeCartItem({ cartId: "c2", unitPrice: 60000, quantity: 1 }),
    ];
    const total = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    expect(total).toBe(170000);
  });

  it("discount PERCENT 20% áp đúng", () => {
    const subtotal = 100000;
    const discount = Math.floor((subtotal * 20) / 100);
    expect(Math.max(0, subtotal - discount)).toBe(80000);
  });

  it("discount lớn hơn subtotal → total = 0", () => {
    const subtotal = 50000;
    const discount = 100000;
    expect(Math.max(0, subtotal - discount)).toBe(0);
  });
});
