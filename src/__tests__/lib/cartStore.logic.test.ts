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

import { computeFinalClientPrice, migrateCartState, retainBundleRewardEffects, useCartStore } from "@/src/lib/store/cartStore";
import { migrateStaffCartState, useStaffCartStore } from "@/src/lib/store/staffCartStore";
import type { CartItem } from "@/src/lib/types/cart";

type BundleStoreTestAdapter = {
  setState: (state: {
    items: CartItem[];
    bundleApplications: Array<{
      voucher_qr_token: string;
      qualifier_allocations: Array<{ client_line_id: string; quantity: number }>;
      reward_allocations: Array<{ client_line_id: string; quantity: number }>;
      created_reward_effects: Array<{ kind: "LINE"; client_line_id: string }>;
    }>;
  }) => void;
  getState: () => {
    items: CartItem[];
    bundleApplications: unknown[];
    markBundleApplicationsVerifyFailed: (message: string) => void;
    markBundleApplicationsUnavailable: (message: string, voucherTokens: string[]) => void;
  };
};

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

/** Tạo một dòng Add-on có thể gắn ITEM voucher. */
function makeExtrasItem(cartId: string, itemVoucherId?: string): CartItem {
  return {
    ...makeCartItem({ unitPrice: 20_000, addonsPrice: 0 }),
    cartId,
    menuItemId: `extras-${cartId}`,
    name: "Kem vanilla",
    category: "extras",
    size: null,
    clientPriceVnd: itemVoucherId ? 0 : 20_000,
    originalClientPriceVnd: 20_000,
    itemVoucherId,
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
  it("dọn ITEM voucher trùng trong giỏ cũ và giữ voucher ở dòng cuối", () => {
    const migrated = migrateCartState(
      {
        items: [
          makeExtrasItem("first", "item-token"),
          makeExtrasItem("second", "item-token"),
        ],
      },
      6,
    );

    expect(migrated.items?.[0]).toMatchObject({
      itemVoucherId: undefined,
      clientPriceVnd: 20_000,
    });
    expect(migrated.items?.[1]).toMatchObject({
      itemVoucherId: "item-token",
      clientPriceVnd: 0,
    });
  });

  it("dọn ITEM voucher trùng trong giỏ staff đã lưu", () => {
    const migrated = migrateStaffCartState({
      items: [
        makeExtrasItem("first", "item-token"),
        makeExtrasItem("second", "item-token"),
      ],
    });

    expect(migrated.items?.[0]).toMatchObject({
      itemVoucherId: undefined,
      clientPriceVnd: 20_000,
    });
    expect(migrated.items?.[1]).toMatchObject({
      itemVoucherId: "item-token",
      clientPriceVnd: 0,
    });
  });

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

  it("bỏ addon legacy giá 0 nhưng giữ addon trả phí khi nâng lên schema opt-in", () => {
    const item = makeCartItem({ unitPrice: 75_000, addonsPrice: 20_000 });
    const migrated = migrateCartState(
      {
        items: [{
          ...item,
          selectedOptionIds: ["legacy-none", "paid-cream"],
          addonPrices: { "legacy-none": 0, "paid-cream": 20_000 },
        }],
      },
      3,
    );

    expect(migrated.items?.[0].selectedOptionIds).toEqual(["paid-cream"]);
    expect(migrated.items?.[0].addonPrices).toEqual({ "paid-cream": 20_000 });
    expect(migrated.items?.[0].clientPriceVnd).toBe(75_000);
  });

  it("giữ voucher của QUANTITY addon khi dọn sentinel trong cart khách", () => {
    const item = makeCartItem({
      unitPrice: 85_000,
      addonsPrice: 30_000,
      addonVouchers: [{ voucherId: "quantity-voucher", addonOptionId: "boba", discountVnd: 10_000 }],
    });
    const migrated = migrateCartState(
      {
        items: [{
          ...item,
          quantityAddonOptions: [{ option_id: "boba", quantity: 3 }],
          addonPrices: { boba: 10_000 },
        }],
      },
      3,
    );

    expect(migrated.items?.[0].addonVouchers).toEqual(item.addonVouchers);
  });

  it("staff cart cũng bỏ sentinel giá 0 và giữ lựa chọn trả phí", () => {
    const item = makeCartItem({ unitPrice: 75_000, addonsPrice: 20_000 });
    const migrated = migrateStaffCartState({
      items: [{
        ...item,
        selectedOptionIds: ["legacy-zero", "paid-cream"],
        addonPrices: { "legacy-zero": 0, "paid-cream": 20_000 },
      }],
    });

    expect(migrated.items?.[0].selectedOptionIds).toEqual(["paid-cream"]);
    expect(migrated.items?.[0].addonPrices).toEqual({ "paid-cream": 20_000 });
  });
});

describe("ITEM voucher chỉ được gắn vào một dòng giỏ hàng", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], selectedVoucherIds: [], isCartOpen: false });
    useStaffCartStore.setState({ items: [] });
  });

  it("customer chuyển voucher khỏi dòng cũ khi thêm dòng Add-on mới", () => {
    const first = makeExtrasItem("first", "item-token");
    useCartStore.setState({ items: [first] });
    const { cartId: _cartId, ...second } = makeExtrasItem("second", "item-token");
    void _cartId;

    useCartStore.getState().addItem(second);

    const items = useCartStore.getState().items;
    expect(items[0]).toMatchObject({ itemVoucherId: undefined, clientPriceVnd: 20_000 });
    expect(items[1]).toMatchObject({ itemVoucherId: "item-token", clientPriceVnd: 0 });
  });

  it("customer chuyển voucher khỏi dòng cũ khi chỉnh sửa dòng khác", () => {
    const first = makeExtrasItem("first", "item-token");
    const second = makeExtrasItem("second");
    useCartStore.setState({ items: [first, second] });

    useCartStore.getState().updateItem("second", {
      itemVoucherId: "item-token",
      clientPriceVnd: 0,
    });

    const items = useCartStore.getState().items;
    expect(items[0]).toMatchObject({ itemVoucherId: undefined, clientPriceVnd: 20_000 });
    expect(items[1]).toMatchObject({ itemVoucherId: "item-token", clientPriceVnd: 0 });
  });

  it("staff cũng chuyển ITEM voucher thay vì giữ trên hai dòng", () => {
    const first = makeExtrasItem("first", "item-token");
    useStaffCartStore.setState({ items: [first] });
    const { cartId: _cartId, ...second } = makeExtrasItem("second", "item-token");
    void _cartId;

    useStaffCartStore.getState().addItem(second);

    const items = useStaffCartStore.getState().items;
    expect(items[0]).toMatchObject({ itemVoucherId: undefined, clientPriceVnd: 20_000 });
    expect(items[1]).toMatchObject({ itemVoucherId: "item-token", clientPriceVnd: 0 });
  });
});

describe("BUNDLE persisted applications", () => {
  it("migration customer xoá BUNDLE legacy nhưng giữ món trả tiền", () => {
    const item = makeCartItem({ unitPrice: 45_000, addonsPrice: 0 });
    const migrated = migrateCartState({
      items: [{ ...item, bundleRewardVoucherToken: "legacy-bundle" }],
      selectedBundleToken: "legacy-bundle",
      bundleAllocations: [{ client_line_id: item.cartId, quantity: 1 }],
    }, 7);

    expect(migrated.items).toHaveLength(1);
    expect(migrated).toHaveProperty("bundleApplications", []);
  });

  it("gỡ application chỉ xoá reward effect do BUNDLE tự tạo", () => {
    const state = useCartStore.getState() as unknown as {
      commitBundleApplication: (input: unknown) => void;
      removeBundleApplication: (token: string) => void;
    };
    const paid = makeCartItem({ unitPrice: 45_000, addonsPrice: 0 });
    const generated = { ...makeCartItem({ unitPrice: 30_000, addonsPrice: 0 }), cartId: "bundle-reward" };
    useCartStore.setState({ items: [paid, generated] });

    state.commitBundleApplication({
      voucher_qr_token: "bundle-token",
      owner_key: "customer:public-user-token",
      qualifier_allocations: [{ client_line_id: paid.cartId, quantity: 1 }],
      reward_allocations: [{ client_line_id: generated.cartId, quantity: 1 }],
      created_reward_effects: [{ kind: "LINE", client_line_id: generated.cartId }],
    });
    state.removeBundleApplication("bundle-token");

    expect(useCartStore.getState().items.map((item) => item.cartId)).toEqual([paid.cartId]);
  });

  it("đổi quà extras tự thêm sẽ gỡ effect cũ nhưng giữ quà mới đang được allocation", () => {
    const paid = makeCartItem({ unitPrice: 45_000, addonsPrice: 0 });
    const generatedA = { ...makeExtrasItem("bundle-extra-a"), name: "Quà A" };
    const generatedB = { ...makeExtrasItem("bundle-extra-b"), name: "Quà B" };
    useCartStore.setState({ items: [paid, generatedA, generatedB], bundleApplications: [] });
    const initialEffects = [{ kind: "LINE" as const, client_line_id: generatedA.cartId }];
    useCartStore.getState().commitBundleApplication({
      voucher_qr_token: "bundle-token",
      owner_key: "customer:public-user-token",
      qualifier_allocations: [{ client_line_id: paid.cartId, quantity: 1 }],
      reward_allocations: [{ client_line_id: generatedA.cartId, quantity: 1 }],
      created_reward_effects: initialEffects,
    });

    const nextEffects = retainBundleRewardEffects(
      initialEffects,
      [{ client_line_id: generatedB.cartId, quantity: 1 }],
      { kind: "LINE", client_line_id: generatedB.cartId },
    );
    useCartStore.getState().commitBundleApplication({
      voucher_qr_token: "bundle-token",
      owner_key: "customer:public-user-token",
      qualifier_allocations: [{ client_line_id: paid.cartId, quantity: 1 }],
      reward_allocations: [{ client_line_id: generatedB.cartId, quantity: 1 }],
      created_reward_effects: nextEffects,
    });

    expect(useCartStore.getState().items.map((item) => item.cartId)).toEqual([paid.cartId, generatedB.cartId]);
  });
});

describe("Hoàn điểm voucher dọn đúng effect trong giỏ khách", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], selectedVoucherIds: [], bundleApplications: [] });
  });

  it("gỡ PRODUCT và phục hồi giá trả tiền nhưng giữ nguyên món", () => {
    const product = {
      ...makeCartItem({ unitPrice: 70_000, addonsPrice: 10_000, productVoucherDiscountVnd: 50_000 }),
      productVoucherId: "refund-token",
      clientPriceVnd: 20_000,
    };
    useCartStore.setState({ items: [product] });

    useCartStore.getState().removeVoucherEffects("refund-token");

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
      clientPriceVnd: 70_000,
    });
  });

  it("gỡ ITEM và phục hồi giá nhưng không xoá extras", () => {
    const extras = makeExtrasItem("paid-extra", "refund-token");
    useCartStore.setState({ items: [extras] });

    useCartStore.getState().removeVoucherEffects("refund-token");

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({
      cartId: "paid-extra",
      itemVoucherId: undefined,
      clientPriceVnd: 20_000,
    });
  });

  it("gỡ đúng ADDON voucher, giữ addon và voucher khác", () => {
    const item = {
      ...makeCartItem({
        unitPrice: 80_000,
        addonsPrice: 20_000,
        addonVouchers: [
          { voucherId: "refund-token", addonOptionId: "cream", discountVnd: 10_000 },
          { voucherId: "keep-token", addonOptionId: "boba", discountVnd: 10_000 },
        ],
      }),
      selectedOptionIds: ["cream", "boba"],
      addonPrices: { cream: 10_000, boba: 10_000 },
      clientPriceVnd: 60_000,
    };
    useCartStore.setState({ items: [item], selectedVoucherIds: ["refund-token", "keep-discount"] });

    useCartStore.getState().removeVoucherEffects("refund-token");

    expect(useCartStore.getState().items[0]).toMatchObject({
      selectedOptionIds: ["cream", "boba"],
      addonVouchers: [{ voucherId: "keep-token", addonOptionId: "boba", discountVnd: 10_000 }],
      clientPriceVnd: 70_000,
    });
    expect(useCartStore.getState().selectedVoucherIds).toEqual(["keep-discount"]);
  });
});

describe("BUNDLE đổi availability giữa picker và checkout", () => {
  const application = {
    voucher_qr_token: "bundle-live-token",
    owner_key: "customer:owner",
    qualifier_allocations: [{ client_line_id: "paid-line", quantity: 1 }],
    reward_allocations: [{ client_line_id: "generated-line", quantity: 1 }],
    created_reward_effects: [{ kind: "LINE" as const, client_line_id: "generated-line" }],
    status: "READY" as const,
  };

  it("customer giữ application và món trả tiền nhưng gỡ reward tự sinh", () => {
    const paid = { ...makeCartItem({ unitPrice: 50_000, addonsPrice: 0 }), cartId: "paid-line" };
    const generated = { ...makeCartItem({ unitPrice: 40_000, addonsPrice: 0 }), cartId: "generated-line" };
    useCartStore.setState({ items: [paid, generated], bundleApplications: [application] });

    useCartStore.getState().markBundleApplicationsUnavailable(
      "Quà tặng hiện không còn phục vụ.",
      ["bundle-live-token"],
    );

    expect(useCartStore.getState().items.map((item) => item.cartId)).toEqual(["paid-line"]);
    expect(useCartStore.getState().bundleApplications).toEqual([
      expect.objectContaining({
        voucher_qr_token: "bundle-live-token",
        status: "UNAVAILABLE",
        message: "Quà tặng hiện không còn phục vụ.",
        created_reward_effects: [],
      }),
    ]);
  });

  it("staff có cùng reconciliation và vẫn giữ application để chặn checkout", () => {
    const paid = { ...makeCartItem({ unitPrice: 50_000, addonsPrice: 0 }), cartId: "paid-line" };
    const generated = { ...makeCartItem({ unitPrice: 40_000, addonsPrice: 0 }), cartId: "generated-line" };
    useStaffCartStore.setState({
      items: [paid, generated],
      bundleApplications: [{ ...application, owner_key: "staff:owner" }],
    });

    useStaffCartStore.getState().markBundleApplicationsUnavailable(
      "Quà tặng hiện không còn phục vụ.",
      ["bundle-live-token"],
    );

    expect(useStaffCartStore.getState().items.map((item) => item.cartId)).toEqual(["paid-line"]);
    expect(useStaffCartStore.getState().bundleApplications[0]).toMatchObject({
      status: "UNAVAILABLE",
      created_reward_effects: [],
    });
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("%s chỉ gỡ BUNDLE A không hợp lệ và giữ nguyên BUNDLE B", (_, rawStore) => {
    const store = rawStore as unknown as BundleStoreTestAdapter;
    const paidA = { ...makeCartItem({ unitPrice: 50_000, addonsPrice: 0 }), cartId: "paid-a" };
    const rewardA = { ...makeCartItem({ unitPrice: 40_000, addonsPrice: 0 }), cartId: "reward-a" };
    const paidB = { ...makeCartItem({ unitPrice: 60_000, addonsPrice: 0 }), cartId: "paid-b" };
    const rewardB = { ...makeCartItem({ unitPrice: 30_000, addonsPrice: 0 }), cartId: "reward-b" };
    store.setState({
      items: [paidA, rewardA, paidB, rewardB],
      bundleApplications: [
        {
          ...application,
          voucher_qr_token: "bundle-a",
          qualifier_allocations: [{ client_line_id: "paid-a", quantity: 1 }],
          reward_allocations: [{ client_line_id: "reward-a", quantity: 1 }],
          created_reward_effects: [{ kind: "LINE", client_line_id: "reward-a" }],
        },
        {
          ...application,
          voucher_qr_token: "bundle-b",
          qualifier_allocations: [{ client_line_id: "paid-b", quantity: 1 }],
          reward_allocations: [{ client_line_id: "reward-b", quantity: 1 }],
          created_reward_effects: [{ kind: "LINE", client_line_id: "reward-b" }],
        },
      ],
    });

    store.getState().markBundleApplicationsVerifyFailed("Đang kiểm tra lại voucher.");
    expect(store.getState().items.map((item) => item.cartId)).toEqual([
      "paid-a", "reward-a", "paid-b", "reward-b",
    ]);

    store.getState().markBundleApplicationsUnavailable(
      "Quà tặng hiện không còn phục vụ.",
      ["bundle-a"],
    );

    expect(store.getState().items.map((item) => item.cartId)).toEqual([
      "paid-a", "paid-b", "reward-b",
    ]);
    expect(store.getState().bundleApplications).toEqual([
      expect.objectContaining({
        voucher_qr_token: "bundle-a",
        status: "UNAVAILABLE",
        created_reward_effects: [],
      }),
      expect.objectContaining({
        voucher_qr_token: "bundle-b",
        status: "READY",
        created_reward_effects: [{ kind: "LINE", client_line_id: "reward-b" }],
      }),
    ]);
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("%s khi refetch lỗi thì khoá xác minh nhưng không gỡ reward", (_, rawStore) => {
    const store = rawStore as unknown as BundleStoreTestAdapter;
    const paid = { ...makeCartItem({ unitPrice: 50_000, addonsPrice: 0 }), cartId: "paid-line" };
    const generated = { ...makeCartItem({ unitPrice: 40_000, addonsPrice: 0 }), cartId: "generated-line" };
    store.setState({ items: [paid, generated], bundleApplications: [application] });

    store.getState().markBundleApplicationsVerifyFailed("Không thể kiểm tra lại voucher.");

    expect(store.getState().items.map((item) => item.cartId)).toEqual(["paid-line", "generated-line"]);
    expect(store.getState().bundleApplications[0]).toMatchObject({
      status: "VERIFY_FAILED",
      message: "Không thể kiểm tra lại voucher.",
    });
  });
});
