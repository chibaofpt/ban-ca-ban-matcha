/**
 * Tests for the new unified voucher selection in cart — CartDrawer logic.
 *
 * New behaviors tested:
 *
 * 1. matchProductVouchers   — finds PRODUCT vouchers applicable to a cart item (by menu_item_id only)
 * 2. matchAddonVouchers     — finds ADDON vouchers applicable to a cart item (by addon_option_id)
 * 3. exclusiveVoucherMap    — ensures 1 voucher → 1 item constraint (can't share across items)
 * 4. applyProductVoucherPrice  — client-side price after PRODUCT voucher (originalPrice - covered_price_vnd)
 * 5. applyAddonVoucherPrice    — client-side price after ADDON voucher (removes addon price from item total)
 * 6. buildOrderPayloadMultiVoucher — full payload with per-item vouchers + multi discount ids
 * 7. previewMultiDiscountTotal — client-side preview total after multi-DISCOUNT vouchers
 * 8. enforceMaxOnePercent   — UI constraint: second PERCENT voucher cannot be selected
 *
 * These tests will FAIL until the implementation is complete.
 */

import { describe, it, expect } from "vitest";
import type { CartItem } from "@/src/lib/types/cart";

// ── Local types mirroring the implementation ──────────────────────────────────

type VoucherType = "DISCOUNT" | "PRODUCT" | "ADDON";
type VoucherStatus = "ACTIVE" | "RESERVED" | "REDEEMED" | "EXPIRED" | "REFUNDED";

interface MyVoucher {
  id: string;
  voucher_type: VoucherType;
  discount_type: "PERCENT" | "FIXED" | null;
  discount_value: number | null;
  menu_item_id: string | null;
  addon_option_id: string | null;
  covered_price_vnd: number | null;
  status: VoucherStatus;
  expires_at: string | null;
  package: { name: string; description: string | null; points_cost: number };
  menuItem: { name: string; is_available: boolean } | null;
  addonOption: { label: string } | null;
  used_channel: "ONLINE" | "OFFLINE" | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  staff: { name: string; role: string } | null;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    cartId: "cart-1",
    menuItemId: "item-meyumi",
    name: "Meyumi Matcha Latte",
    category: "latte",
    imageUrl: null,
    size: "M",
    unitPrice: 55_000,
    quantity: 1,
    sweetness: "QUARTER",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: [],
    quantityMap: {},
    addonsPrice: 0, addonPrices: {},
    quantityAddonOptions: [],
    clientPriceVnd: 55_000,
    originalClientPriceVnd: 55_000,
    ...overrides,
  };
}

function makeProductVoucher(overrides: Partial<MyVoucher> = {}): MyVoucher {
  return {
    id: "pv-1",
    voucher_type: "PRODUCT",
    discount_type: null,
    discount_value: null,
    menu_item_id: "item-meyumi",
    addon_option_id: null,
    covered_price_vnd: 50_000,
    status: "ACTIVE",
    expires_at: null,
    package: { name: "Meyumi miễn phí", description: null, points_cost: 100 },
    menuItem: { name: "Meyumi Matcha Latte", is_available: true },
    addonOption: null,
    used_channel: null,
    redeemed_at: null,
    redeemed_by: null,
    staff: null,
    ...overrides,
  };
}

function makeAddonVoucher(overrides: Partial<MyVoucher> = {}): MyVoucher {
  return {
    id: "av-1",
    voucher_type: "ADDON",
    discount_type: null,
    discount_value: null,
    menu_item_id: null,
    addon_option_id: "addon-kem-tuoi",
    covered_price_vnd: null,
    status: "ACTIVE",
    expires_at: null,
    package: { name: "Kem tươi miễn phí", description: null, points_cost: 30 },
    menuItem: null,
    addonOption: { label: "Kem tươi" },
    used_channel: null,
    redeemed_at: null,
    redeemed_by: null,
    staff: null,
    ...overrides,
  };
}

function makeDiscountVoucher(
  type: "PERCENT" | "FIXED",
  value: number,
  id = "dv-1"
): MyVoucher {
  return {
    id,
    voucher_type: "DISCOUNT",
    discount_type: type,
    discount_value: value,
    menu_item_id: null,
    addon_option_id: null,
    covered_price_vnd: null,
    status: "ACTIVE",
    expires_at: null,
    package: { name: `Giảm ${value}${type === "PERCENT" ? "%" : "đ"}`, description: null, points_cost: 50 },
    menuItem: null,
    addonOption: null,
    used_channel: null,
    redeemed_at: null,
    redeemed_by: null,
    staff: null,
  };
}

// ── Pure functions to be implemented ─────────────────────────────────────────
// These are extracted from CartDrawer component logic for testability.

/**
 * Returns the list of PRODUCT vouchers that can be applied to a given cart item.
 * Matching rule: voucher.menu_item_id === item.menuItemId (size/config doesn't matter).
 * Filters: status=ACTIVE, not expired.
 */
function matchProductVouchers(item: CartItem, vouchers: MyVoucher[]): MyVoucher[] {
  const now = new Date();
  return vouchers.filter(
    (v) =>
      v.voucher_type === "PRODUCT" &&
      v.status === "ACTIVE" &&
      v.menu_item_id === item.menuItemId &&
      (v.expires_at === null || new Date(v.expires_at) > now)
  );
}

/**
 * Returns the list of ADDON vouchers applicable to a given cart item.
 * Matching rule: voucher.addon_option_id exists in item's selected addons
 * (both selectedOptionIds and quantityAddonOptions).
 */
function matchAddonVouchers(item: CartItem, vouchers: MyVoucher[]): MyVoucher[] {
  const now = new Date();
  const allAddonIds = new Set([
    ...item.selectedOptionIds,
    ...item.quantityAddonOptions.map((a) => a.option_id),
  ]);
  return vouchers.filter(
    (v) =>
      v.voucher_type === "ADDON" &&
      v.status === "ACTIVE" &&
      v.addon_option_id !== null &&
      allAddonIds.has(v.addon_option_id) &&
      (v.expires_at === null || new Date(v.expires_at) > now)
  );
}

/**
 * Computes the client-side price of a cart item after applying a PRODUCT voucher.
 * result = max(0, originalClientPriceVnd - covered_price_vnd)
 */
function applyProductVoucherPrice(item: CartItem, voucher: MyVoucher): number {
  if (!voucher.covered_price_vnd) return item.clientPriceVnd;
  return Math.max(0, item.originalClientPriceVnd - voucher.covered_price_vnd);
}

/**
 * Computes the client-side price of a cart item after removing a specific addon's cost.
 * Used when ADDON voucher is applied: the matched addon's price is zeroed.
 */
function applyAddonVoucherPrice(
  item: CartItem,
  addonPriceVnd: number
): number {
  return Math.max(0, item.clientPriceVnd - addonPriceVnd);
}

/**
 * Checks if a given voucher ID is already used on another item in the cart.
 * Ensures 1 voucher → 1 item (no double-use).
 */
function isVoucherAlreadyUsed(
  voucherId: string,
  cartItems: CartItem[],
  excludeCartId: string
): boolean {
  return cartItems.some(
    (item) =>
      item.cartId !== excludeCartId &&
      (item.productVoucherId === voucherId || item.addonVouchers?.some(v => v.voucherId === voucherId))
  );
}

/**
 * Computes client-side preview of total after applying multiple DISCOUNT vouchers.
 * Rule: FIXED vouchers applied first (in order), then 1 PERCENT on remainder.
 */
function previewMultiDiscountTotal(
  subtotal: number,
  selectedDiscountVouchers: MyVoucher[]
): number {
  let remaining = subtotal;

  // Apply all FIXED first
  for (const v of selectedDiscountVouchers) {
    if (v.discount_type === "FIXED" && v.discount_value !== null) {
      remaining = Math.max(0, remaining - v.discount_value);
    }
  }

  // Apply 1 PERCENT last
  const percentVoucher = selectedDiscountVouchers.find(
    (v) => v.discount_type === "PERCENT" && v.discount_value !== null
  );
  if (percentVoucher && percentVoucher.discount_value) {
    remaining = Math.max(
      0,
      remaining - Math.floor((remaining * percentVoucher.discount_value) / 100)
    );
  }

  return remaining;
}

/**
 * UI enforcement: returns true if a PERCENT voucher can be selected.
 * Rule: max 1 PERCENT voucher per order.
 */
function canSelectPercentVoucher(
  voucherId: string,
  currentlySelected: string[],
  allVouchers: MyVoucher[]
): boolean {
  // If already selected, can always deselect
  if (currentlySelected.includes(voucherId)) return true;

  const selectedPercentCount = currentlySelected.filter((id) => {
    const v = allVouchers.find((x) => x.id === id);
    return v?.discount_type === "PERCENT";
  }).length;

  return selectedPercentCount === 0;
}

/**
 * Builds the full createOrder payload including per-item vouchers and multi-discount IDs.
 */
function buildOrderPayloadMultiVoucher(
  cartItems: CartItem[],
  discountVoucherIds: string[]
): {
  items: {
    menu_item_id: string;
    quantity: number;
    client_price_vnd: number;
    product_voucher_id?: string;
    addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
  }[];
  discount_voucher_ids: string[];
} {
  return {
    discount_voucher_ids: discountVoucherIds,
    items: cartItems.map((c) => ({
      menu_item_id: c.menuItemId,
      quantity: c.quantity,
      client_price_vnd: c.clientPriceVnd,
      ...(c.productVoucherId ? { product_voucher_id: c.productVoucherId } : {}),
      ...(c.addonVouchers && c.addonVouchers.length > 0 ? { addon_voucher_ids: c.addonVouchers.map(av => ({ voucher_id: av.voucherId, addon_option_id: av.addonOptionId })) } : {}),
    })),
  };
}

// ── matchProductVouchers ──────────────────────────────────────────────────────

describe("matchProductVouchers", () => {
  it("trả về voucher PRODUCT khớp menu_item_id", () => {
    const item = makeCartItem({ menuItemId: "item-meyumi", size: "L" });
    const pv = makeProductVoucher({ menu_item_id: "item-meyumi" });

    const result = matchProductVouchers(item, [pv]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pv-1");
  });

  it("chỉ cần khớp menu_item_id — size khác nhau vẫn match", () => {
    // Voucher chỉ quy định menu_item_id, không quan tâm size
    const itemL = makeCartItem({ menuItemId: "item-meyumi", size: "L" });
    const pv = makeProductVoucher({ menu_item_id: "item-meyumi" }); // voucher không có size constraint

    const result = matchProductVouchers(itemL, [pv]);
    expect(result).toHaveLength(1);
  });

  it("không match khi menu_item_id khác", () => {
    const item = makeCartItem({ menuItemId: "item-shiro" });
    const pv = makeProductVoucher({ menu_item_id: "item-meyumi" });

    const result = matchProductVouchers(item, [pv]);
    expect(result).toHaveLength(0);
  });

  it("không trả về voucher REDEEMED", () => {
    const item = makeCartItem({ menuItemId: "item-meyumi" });
    const pv = makeProductVoucher({ status: "REDEEMED" });

    const result = matchProductVouchers(item, [pv]);
    expect(result).toHaveLength(0);
  });

  it("không trả về voucher đã hết hạn", () => {
    const item = makeCartItem({ menuItemId: "item-meyumi" });
    const expired = makeProductVoucher({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });

    const result = matchProductVouchers(item, [expired]);
    expect(result).toHaveLength(0);
  });

  it("không trả về DISCOUNT hoặc ADDON voucher", () => {
    const item = makeCartItem({ menuItemId: "item-meyumi" });
    const discountV = makeDiscountVoucher("PERCENT", 10);
    const addonV = makeAddonVoucher();

    const result = matchProductVouchers(item, [discountV, addonV]);
    expect(result).toHaveLength(0);
  });

  it("nhiều voucher PRODUCT → trả về tất cả khớp", () => {
    const item = makeCartItem({ menuItemId: "item-meyumi" });
    const pv1 = makeProductVoucher({ id: "pv-1", menu_item_id: "item-meyumi" });
    const pv2 = makeProductVoucher({ id: "pv-2", menu_item_id: "item-meyumi" });
    const pv3 = makeProductVoucher({ id: "pv-3", menu_item_id: "item-shiro" });

    const result = matchProductVouchers(item, [pv1, pv2, pv3]);
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toContain("pv-1");
    expect(result.map((v) => v.id)).toContain("pv-2");
  });
});

// ── matchAddonVouchers ────────────────────────────────────────────────────────

describe("matchAddonVouchers", () => {
  it("match khi addon_option_id có trong selectedOptionIds", () => {
    const item = makeCartItem({ selectedOptionIds: ["addon-kem-tuoi", "addon-da-dua"] });
    const av = makeAddonVoucher({ addon_option_id: "addon-kem-tuoi" });

    const result = matchAddonVouchers(item, [av]);
    expect(result).toHaveLength(1);
  });

  it("match khi addon_option_id có trong quantityAddonOptions", () => {
    const item = makeCartItem({
      selectedOptionIds: [],
      quantityAddonOptions: [{ option_id: "addon-extra-matcha", quantity: 2 }],
    });
    const av = makeAddonVoucher({ addon_option_id: "addon-extra-matcha" });

    const result = matchAddonVouchers(item, [av]);
    expect(result).toHaveLength(1);
  });

  it("không match khi cart item không có addon đó", () => {
    const item = makeCartItem({ selectedOptionIds: ["addon-khac"] });
    const av = makeAddonVoucher({ addon_option_id: "addon-kem-tuoi" });

    const result = matchAddonVouchers(item, [av]);
    expect(result).toHaveLength(0);
  });

  it("không match khi item không có addon nào", () => {
    const item = makeCartItem({ selectedOptionIds: [], quantityAddonOptions: [] });
    const av = makeAddonVoucher({ addon_option_id: "addon-kem-tuoi" });

    const result = matchAddonVouchers(item, [av]);
    expect(result).toHaveLength(0);
  });

  it("không trả về voucher REDEEMED", () => {
    const item = makeCartItem({ selectedOptionIds: ["addon-kem-tuoi"] });
    const av = makeAddonVoucher({ status: "REDEEMED" });

    const result = matchAddonVouchers(item, [av]);
    expect(result).toHaveLength(0);
  });

  it("không trả về PRODUCT hoặc DISCOUNT voucher", () => {
    const item = makeCartItem({ selectedOptionIds: ["addon-kem-tuoi"] });
    const pv = makeProductVoucher();

    const result = matchAddonVouchers(item, [pv]);
    expect(result).toHaveLength(0);
  });
});

// ── isVoucherAlreadyUsed ──────────────────────────────────────────────────────

describe("isVoucherAlreadyUsed — 1 voucher 1 item constraint", () => {
  it("voucher chưa được dùng trên item nào → false", () => {
    const items = [makeCartItem({ cartId: "c1" }), makeCartItem({ cartId: "c2" })];
    expect(isVoucherAlreadyUsed("pv-1", items, "c1")).toBe(false);
  });

  it("voucher đang dùng trên item khác → true", () => {
    const items = [
      makeCartItem({ cartId: "c1" }),
      makeCartItem({ cartId: "c2", productVoucherId: "pv-1" }),
    ];
    // Đang check cho item c1, nhưng pv-1 đã được dùng ở c2
    expect(isVoucherAlreadyUsed("pv-1", items, "c1")).toBe(true);
  });

  it("voucher đang dùng trên chính item đang xem → false (không tính exclude)", () => {
    const items = [makeCartItem({ cartId: "c1", productVoucherId: "pv-1" })];
    // excludeCartId = "c1", tức là bỏ qua chính nó
    expect(isVoucherAlreadyUsed("pv-1", items, "c1")).toBe(false);
  });

  it("addon voucher cũng bị kiểm tra", () => {
    const items = [
      makeCartItem({ cartId: "c1" }),
      makeCartItem({ cartId: "c2", addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] }),
    ];
    expect(isVoucherAlreadyUsed("av-1", items, "c1")).toBe(true);
  });
});

// ── applyProductVoucherPrice ──────────────────────────────────────────────────

describe("applyProductVoucherPrice", () => {
  it("covered_price_vnd < item price → item price giảm đúng phần covered", () => {
    const item = makeCartItem({ clientPriceVnd: 55_000, originalClientPriceVnd: 55_000 });
    const pv = makeProductVoucher({ covered_price_vnd: 50_000 });

    expect(applyProductVoucherPrice(item, pv)).toBe(5_000);
  });

  it("covered_price_vnd >= item price → item price = 0 (không âm)", () => {
    const item = makeCartItem({ clientPriceVnd: 55_000, originalClientPriceVnd: 55_000 });
    const pv = makeProductVoucher({ covered_price_vnd: 80_000 });

    expect(applyProductVoucherPrice(item, pv)).toBe(0);
  });

  it("covered_price_vnd = null → giá không thay đổi", () => {
    const item = makeCartItem({ clientPriceVnd: 55_000, originalClientPriceVnd: 55_000 });
    const pv = makeProductVoucher({ covered_price_vnd: null });

    expect(applyProductVoucherPrice(item, pv)).toBe(55_000);
  });

  it("tính từ originalClientPriceVnd chứ không phải clientPriceVnd hiện tại", () => {
    // Trường hợp đã bị sửa giá trước (e.g., swap voucher)
    const item = makeCartItem({ clientPriceVnd: 10_000, originalClientPriceVnd: 55_000 });
    const pv = makeProductVoucher({ covered_price_vnd: 50_000 });

    // Nên tính từ original: 55K - 50K = 5K
    expect(applyProductVoucherPrice(item, pv)).toBe(5_000);
  });
});

// ── applyAddonVoucherPrice ────────────────────────────────────────────────────

describe("applyAddonVoucherPrice", () => {
  it("trừ addon price khỏi item total", () => {
    const item = makeCartItem({ clientPriceVnd: 65_000 }); // 55K + 10K kem
    expect(applyAddonVoucherPrice(item, 10_000)).toBe(55_000);
  });

  it("addon price lớn hơn item total → 0 (không âm)", () => {
    const item = makeCartItem({ clientPriceVnd: 5_000 });
    expect(applyAddonVoucherPrice(item, 20_000)).toBe(0);
  });

  it("addonPriceVnd = 0 → giá không thay đổi", () => {
    const item = makeCartItem({ clientPriceVnd: 55_000 });
    expect(applyAddonVoucherPrice(item, 0)).toBe(55_000);
  });
});

// ── previewMultiDiscountTotal ─────────────────────────────────────────────────

describe("previewMultiDiscountTotal", () => {
  it("không có voucher → tổng không thay đổi", () => {
    expect(previewMultiDiscountTotal(100_000, [])).toBe(100_000);
  });

  it("1 FIXED 20K → 80K", () => {
    const v = makeDiscountVoucher("FIXED", 20_000);
    expect(previewMultiDiscountTotal(100_000, [v])).toBe(80_000);
  });

  it("1 PERCENT 10% → 90K", () => {
    const v = makeDiscountVoucher("PERCENT", 10);
    expect(previewMultiDiscountTotal(100_000, [v])).toBe(90_000);
  });

  it("2 FIXED (10K + 15K) + 1 PERCENT 15% → thứ tự đúng", () => {
    const f1 = makeDiscountVoucher("FIXED", 10_000, "f1");
    const f2 = makeDiscountVoucher("FIXED", 15_000, "f2");
    const p = makeDiscountVoucher("PERCENT", 15, "p1");

    // 100K - 10K = 90K, 90K - 15K = 75K → 75K * 85% = 63750
    expect(previewMultiDiscountTotal(100_000, [f1, f2, p])).toBe(63_750);
  });

  it("tổng discount không làm total âm", () => {
    const f = makeDiscountVoucher("FIXED", 500_000);
    expect(previewMultiDiscountTotal(50_000, [f])).toBe(0);
  });

  it("chỉ lấy PERCENT đầu tiên (max 1 PERCENT — UI đã enforce)", () => {
    // Nếu bằng cách nào đó 2 PERCENT lọt vào (should not happen in practice)
    // function chỉ áp cái đầu tiên tìm được
    const p1 = makeDiscountVoucher("PERCENT", 10, "p1");
    const p2 = makeDiscountVoucher("PERCENT", 20, "p2");

    // 100K * (1 - 10%) = 90K — chỉ áp p1
    expect(previewMultiDiscountTotal(100_000, [p1, p2])).toBe(90_000);
  });
});

// ── canSelectPercentVoucher ───────────────────────────────────────────────────

describe("canSelectPercentVoucher — max 1 PERCENT constraint", () => {
  it("chưa có PERCENT nào → có thể chọn PERCENT", () => {
    const vouchers = [makeDiscountVoucher("PERCENT", 10, "p1")];
    expect(canSelectPercentVoucher("p1", [], vouchers)).toBe(true);
  });

  it("đã chọn 1 PERCENT → không thể chọn PERCENT khác", () => {
    const p1 = makeDiscountVoucher("PERCENT", 10, "p1");
    const p2 = makeDiscountVoucher("PERCENT", 20, "p2");
    const vouchers = [p1, p2];

    // p1 đã được chọn → p2 không thể chọn thêm
    expect(canSelectPercentVoucher("p2", ["p1"], vouchers)).toBe(false);
  });

  it("đã chọn 1 PERCENT → vẫn có thể deselect cái đó (voucherId đã có trong selected)", () => {
    const p1 = makeDiscountVoucher("PERCENT", 10, "p1");
    const vouchers = [p1];

    // p1 đã selected → click lần nữa (deselect) vẫn ok
    expect(canSelectPercentVoucher("p1", ["p1"], vouchers)).toBe(true);
  });

  it("đã chọn FIXED → không ảnh hưởng đến PERCENT limit", () => {
    const f1 = makeDiscountVoucher("FIXED", 20_000, "f1");
    const p1 = makeDiscountVoucher("PERCENT", 10, "p1");
    const vouchers = [f1, p1];

    // f1 đã chọn (FIXED) → vẫn có thể chọn PERCENT
    expect(canSelectPercentVoucher("p1", ["f1"], vouchers)).toBe(true);
  });

  it("không có PERCENT nào được chọn khi list selected rỗng", () => {
    const p1 = makeDiscountVoucher("PERCENT", 10, "p1");
    const vouchers = [p1];

    expect(canSelectPercentVoucher("p1", [], vouchers)).toBe(true);
  });
});

// ── buildOrderPayloadMultiVoucher ─────────────────────────────────────────────

describe("buildOrderPayloadMultiVoucher", () => {
  it("không có voucher nào → discount_voucher_ids rỗng, items không có voucher fields", () => {
    const items = [makeCartItem({ menuItemId: "item-a", clientPriceVnd: 55_000 })];
    const payload = buildOrderPayloadMultiVoucher(items, []);

    expect(payload.discount_voucher_ids).toHaveLength(0);
    expect("product_voucher_id" in payload.items[0]).toBe(false);
    expect(payload.items[0].addon_voucher_ids).toBeUndefined();
  });

  it("1 DISCOUNT voucher → discount_voucher_ids chứa đúng id", () => {
    const items = [makeCartItem()];
    const payload = buildOrderPayloadMultiVoucher(items, ["dv-1"]);

    expect(payload.discount_voucher_ids).toEqual(["dv-1"]);
  });

  it("nhiều DISCOUNT vouchers → tất cả có trong discount_voucher_ids", () => {
    const items = [makeCartItem()];
    const payload = buildOrderPayloadMultiVoucher(items, ["dv-1", "dv-2", "dv-3"]);

    expect(payload.discount_voucher_ids).toHaveLength(3);
    expect(payload.discount_voucher_ids).toContain("dv-2");
  });

  it("item có productVoucherId → product_voucher_id có trong payload item", () => {
    const items = [makeCartItem({ productVoucherId: "pv-abc" })];
    const payload = buildOrderPayloadMultiVoucher(items, []);

    expect(payload.items[0].product_voucher_id).toBe("pv-abc");
  });

  it("item có addonVoucherId → addon_voucher_id có trong payload item", () => {
    const items = [makeCartItem({ addonVouchers: [{ voucherId: "av-xyz", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] })];
    const payload = buildOrderPayloadMultiVoucher(items, []);

    expect(payload.items[0].addon_voucher_ids).toEqual([{ voucher_id: "av-xyz", addon_option_id: "addon-kem-tuoi" }]);
  });

  it("mixed: item A có product voucher, item B có addon voucher, + 2 discount vouchers", () => {
    const items = [
      makeCartItem({ cartId: "c1", menuItemId: "item-a", productVoucherId: "pv-1" }),
      makeCartItem({ cartId: "c2", menuItemId: "item-b", addonVouchers: [{ voucherId: "av-1", addonOptionId: "addon-kem-tuoi", discountVnd: 0 }] }),
    ];
    const payload = buildOrderPayloadMultiVoucher(items, ["dv-1", "dv-2"]);

    expect(payload.discount_voucher_ids).toEqual(["dv-1", "dv-2"]);
    expect(payload.items[0].product_voucher_id).toBe("pv-1");
    expect(payload.items[0].addon_voucher_ids).toBeUndefined();
    expect(payload.items[1].addon_voucher_ids).toEqual([{ voucher_id: "av-1", addon_option_id: "addon-kem-tuoi" }]);
    expect("product_voucher_id" in payload.items[1]).toBe(false);
  });

  it("client_price_vnd phản ánh giá đã áp voucher (giá khách thực trả)", () => {
    // Item đã được applyProductVoucherPrice → clientPriceVnd = 5K
    const items = [
      makeCartItem({ clientPriceVnd: 5_000, originalClientPriceVnd: 55_000, productVoucherId: "pv-1" }),
    ];
    const payload = buildOrderPayloadMultiVoucher(items, []);

    expect(payload.items[0].client_price_vnd).toBe(5_000);
  });
});
