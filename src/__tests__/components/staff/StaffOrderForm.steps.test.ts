import { describe, it, expect } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";

// ── Step transition logic mirroring StaffOrderForm ───────────────────────────

type Step = "phone" | "confirm-found" | "nickname" | "confirm-new";

function validatePhone(phone: string): boolean {
  return /^(0|\+84)\d{9}$/.test(phone.trim());
}

function afterLookup(found: boolean): Step {
  return found ? "confirm-found" : "nickname";
}

function afterNickname(nickname: string): Step | null {
  return nickname.trim().length > 0 ? "confirm-new" : null;
}

// ── buildOrderItems — mirrors StaffOrderForm.tsx ──────────────────────────────

/** Mirrors the production buildOrderItems function in StaffOrderForm.tsx */
function buildOrderItems(cart: CartItem[]) {
  return cart.map((c) => ({
    menu_item_id: c.menuItemId,
    quantity: c.quantity,
    size: c.size,
    sweetness: c.sweetness,
    ice_option: c.iceOption,
    coldwhisk: c.coldwhisk,
    ...(c.note ? { note: c.note } : {}),
    addon_option_ids: [
      ...c.selectedOptionIds.map((id) => ({ option_id: id, quantity: 1 })),
      ...c.quantityAddonOptions,
    ],
    ...(c.productVoucherId ? { product_voucher_id: c.productVoucherId } : {}),
    ...(c.selectedPowderId ? { selected_powder_id: c.selectedPowderId } : {}),
    ...(c.selectedMilkTypeId ? { selected_milk_type_id: c.selectedMilkTypeId } : {}),
    client_price_vnd: c.clientPriceVnd,
  }));
}

/** Base CartItem fixture — all required fields filled. */
function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItemId: "item-latte-aaa",
    name: "Trà Xanh Sữa",
    category: "latte",
    imageUrl: null,
    size: "L",
    unitPrice: 69000,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    quantityMap: {},
    addonsPrice: 0, addonPrices: {},
    quantityAddonOptions: [],
    clientPriceVnd: 69000,
    originalClientPriceVnd: 69000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("phone validation", () => {
  it("số bắt đầu 0 hợp lệ", () => {
    expect(validatePhone("0912345678")).toBe(true);
  });

  it("số bắt đầu +84 hợp lệ", () => {
    expect(validatePhone("+84912345678")).toBe(true);
  });

  it("số thiếu chữ số → không hợp lệ", () => {
    expect(validatePhone("091234")).toBe(false);
  });

  it("chuỗi rỗng → không hợp lệ", () => {
    expect(validatePhone("")).toBe(false);
  });

  it("có ký tự chữ → không hợp lệ", () => {
    expect(validatePhone("091234abcd")).toBe(false);
  });
});

describe("step transitions", () => {
  it("found = true → confirm-found", () => {
    expect(afterLookup(true)).toBe("confirm-found");
  });

  it("found = false → nickname", () => {
    expect(afterLookup(false)).toBe("nickname");
  });

  it("nickname có nội dung → confirm-new", () => {
    expect(afterNickname("Linh Cá Heo")).toBe("confirm-new");
  });

  it("nickname rỗng → không đi tiếp", () => {
    expect(afterNickname("")).toBeNull();
    expect(afterNickname("   ")).toBeNull();
  });
});

describe("buildOrderItems", () => {
  it("maps tất cả 5 fields bắt buộc mới: size, ice_option, coldwhisk, client_price_vnd", () => {
    const cart = [makeCartItem({ iceOption: "LESS_ICE", coldwhisk: true, clientPriceVnd: 75000 })];
    const result = buildOrderItems(cart);

    expect(result[0].size).toBe("L");
    expect(result[0].ice_option).toBe("LESS_ICE");
    expect(result[0].coldwhisk).toBe(true);
    expect(result[0].client_price_vnd).toBe(75000);
  });

  it("selected_powder_id được forward cho Fusion item", () => {
    const cart = [makeCartItem({ category: "fusion", selectedPowderId: "powder-xyz" })];
    const result = buildOrderItems(cart);

    expect(result[0].selected_powder_id).toBe("powder-xyz");
  });

  it("selected_milk_type_id được forward cho Latte item", () => {
    const cart = [makeCartItem({ selectedMilkTypeId: "milk-abc" })];
    const result = buildOrderItems(cart);

    expect(result[0].selected_milk_type_id).toBe("milk-abc");
  });

  it("selected_powder_id và selected_milk_type_id bị bỏ qua khi không có", () => {
    const cart = [makeCartItem()]; // no powder/milk
    const result = buildOrderItems(cart);

    expect("selected_powder_id" in result[0]).toBe(false);
    expect("selected_milk_type_id" in result[0]).toBe(false);
  });

  it("note bị bỏ qua khi rỗng", () => {
    const cart = [makeCartItem({ note: "" })];
    const result = buildOrderItems(cart);

    expect("note" in result[0]).toBe(false);
  });

  it("note được forward khi có nội dung", () => {
    const cart = [makeCartItem({ note: "Bớt đường" })];
    const result = buildOrderItems(cart);

    expect(result[0].note).toBe("Bớt đường");
  });

  it("addon_option_ids gộp selectedOptionIds (qty=1) và quantityAddonOptions", () => {
    const cart = [
      makeCartItem({
        selectedOptionIds: ["opt-kem", "opt-da-dua"],
        quantityAddonOptions: [{ option_id: "opt-extra-matcha", quantity: 2 }],
      }),
    ];
    const result = buildOrderItems(cart);

    expect(result[0].addon_option_ids).toEqual([
      { option_id: "opt-kem", quantity: 1 },
      { option_id: "opt-da-dua", quantity: 1 },
      { option_id: "opt-extra-matcha", quantity: 2 },
    ]);
  });

  it("product_voucher_id được forward khi có", () => {
    const cart = [makeCartItem({ productVoucherId: "voucher-free" })];
    const result = buildOrderItems(cart);

    expect(result[0].product_voucher_id).toBe("voucher-free");
  });

  it("product_voucher_id bị bỏ qua khi không có", () => {
    const cart = [makeCartItem()];
    const result = buildOrderItems(cart);

    expect("product_voucher_id" in result[0]).toBe(false);
  });

  it("xử lý nhiều items — mỗi item độc lập", () => {
    const cart = [
      makeCartItem({ menuItemId: "item-A", clientPriceVnd: 55000, quantity: 2 }),
      makeCartItem({ menuItemId: "item-B", clientPriceVnd: 69000, quantity: 1, iceOption: "NO_ICE" }),
    ];
    const result = buildOrderItems(cart);

    expect(result).toHaveLength(2);
    expect(result[0].menu_item_id).toBe("item-A");
    expect(result[0].client_price_vnd).toBe(55000);
    expect(result[1].ice_option).toBe("NO_ICE");
  });
});
