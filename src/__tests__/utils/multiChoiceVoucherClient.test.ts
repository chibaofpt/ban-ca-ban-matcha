import { beforeEach, describe, expect, it } from "vitest";
import { attachPendingAddonVoucher, configureFixedAddon, useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import type { CartItem } from "@/src/lib/types/cart";
import { applyCartCommand } from "@/src/lib/utils/cartTransitions";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import {
  buildAddonVoucherMap,
  estimateProductSavings,
  filterUsableVouchers,
  getAppliedMenuVoucherId,
  getCartAddonVoucherTargets,
  getAddonVoucherTargetChoices,
  hasAddonVoucherForOption,
  matchProductVouchers,
  resolveAddonVoucherOptionId,
  resolveAddonVoucherOptionForCartItem,
} from "@/src/utils/voucherMatchUtils";
import { selectOrderVoucherToken } from "@/src/utils/customerVoucherSelection";

const baseVoucher = (patch: Partial<MyVoucher>): MyVoucher => ({
  qr_token: "voucher-token",
  voucher_type: "PRODUCT",
  discount_type: null,
  discount_value: null,
  menu_item_id: "legacy-anchor",
  size: "MEDIUM",
  matcha_powder_id: null,
  milk_type_id: null,
  included_addon_option_ids: [],
  addon_option_id: null,
  covered_price_vnd: 45_000,
  covered_delivery_fee_vnd: null,
  min_order_vnd: null,
  max_discount_vnd: null,
  status: "ACTIVE",
  used_channel: null,
  expires_at: null,
  redeemed_at: null,
  created_at: "2026-09-08T00:00:00.000Z",
  package: { name: "Voucher", description: null, points_cost: 10 },
  menuItem: null,
  addonOption: null,
  staff: null,
  availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
  ...patch,
});

const drink = (patch: Parameters<typeof projectedCartLine>[0] = {}): Omit<CartItem, "cartId"> => {
  const full = projectedCartLine({
  menuItemId: "drink-b",
  name: "Matcha B",
  category: "fusion",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 65_000,
  quantity: 1,
  sweetness: "FULL",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  addonMetadata: {},
  clientPriceVnd: 65_000,
  originalClientPriceVnd: 65_000,
    ...patch,
  });
  return {
    menuItemId: full.menuItemId,
    quantity: full.quantity,
    configuration: full.configuration,
    ...(full.lineVoucher ? { lineVoucher: full.lineVoucher } : {}),
    addonVouchers: full.addonVouchers.map(({ token, addonOptionId }) => ({ token, addonOptionId })),
  };
};

describe("multi-choice voucher client contracts", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], pendingAddonVoucher: null, selectedVoucherIds: [], bundleApplications: [] });
    useStaffCartStore.setState({ items: [], pendingAddonVoucher: null, selectedDiscountIds: [], bundleApplications: [] });
  });

  it("matches PRODUCT by scoped menu item and uses that target's independent credit", () => {
    const voucher = baseVoucher({ eligible_menu_items: [
      { menu_item_id: "legacy-anchor", name: "A", category: "latte", is_available: true, is_seasonal: false, covered_price_vnd: 45_000 },
      { menu_item_id: "drink-b", name: "B", category: "fusion", is_available: true, is_seasonal: false, covered_price_vnd: 58_000 },
    ] });
    expect(matchProductVouchers([voucher], "drink-b")).toEqual([voucher]);
    expect(estimateProductSavings(voucher, 65_000, "drink-b")).toBe(58_000);
  });

  it("giữ tối đa một voucher PERCENT khi voucher quét được khóa vào selection staff", () => {
    const scannedPercent = { qr_token: "scanned-percent", voucher_type: "DISCOUNT", discount_type: "PERCENT" };
    const walletPercent = { qr_token: "wallet-percent", voucher_type: "DISCOUNT", discount_type: "PERCENT" };
    const walletFixed = { qr_token: "wallet-fixed", voucher_type: "DISCOUNT", discount_type: "FIXED" };

    expect(selectOrderVoucherToken(
      [walletFixed.qr_token, walletPercent.qr_token],
      scannedPercent,
      [walletFixed, walletPercent, scannedPercent],
    )).toEqual([walletFixed.qr_token, scannedPercent.qr_token]);
  });

  it("matches ADDON by the selected scoped option instead of only the legacy anchor", () => {
    const voucher = baseVoucher({
      voucher_type: "ADDON",
      addon_option_id: "addon-a",
      eligible_addon_options: [
        { addon_option_id: "addon-a", label: "A", price_vnd: 8_000, is_active: true, is_dynamic_gram: false },
        { addon_option_id: "addon-b", label: "B", price_vnd: 10_000, is_active: true, is_dynamic_gram: false },
      ],
    });
    const item = projectedCartLine({ cartId: "line-1", selectedOptionIds: ["addon-b"], addonPrices: { "addon-b": 10_000 }, addonsPrice: 10_000 });
    expect(buildAddonVoucherMap([voucher], [item]).get("line-1")).toEqual([voucher]);
  });

  it("không rơi về addon neo cũ đã inactive khi target khác vẫn dùng được", () => {
    const voucher = baseVoucher({
      voucher_type: "ADDON",
      addon_option_id: "addon-a",
      eligible_addon_options: [
        { addon_option_id: "addon-a", label: "A", price_vnd: 8_000, is_active: false, is_dynamic_gram: false },
        { addon_option_id: "addon-b", label: "B", price_vnd: 10_000, is_active: true, is_dynamic_gram: false },
      ],
    });
    expect(resolveAddonVoucherOptionId(voucher)).toBe("addon-b");
    expect(resolveAddonVoucherOptionId(voucher, ["addon-b"])).toBe("addon-b");
    expect(resolveAddonVoucherOptionId(voucher, ["addon-a"])).toBeNull();
  });

  it("không auto-apply ADDON ACTIVE khi live availability đã unusable", () => {
    const voucher = baseVoucher({
      voucher_type: "ADDON",
      addon_option_id: "legacy-anchor",
      eligible_addon_options: [],
      availability: { status: "TARGET_UNAVAILABLE", can_apply: false, can_refund: false, refund_points: 0 },
    });
    expect(filterUsableVouchers([voucher], "ADDON")).toEqual([]);
  });

  it("cho voucher ADDON thứ hai chọn target chưa được voucher khác chi trả", () => {
    const firstVoucher = baseVoucher({
      qr_token: "addon-voucher-a",
      voucher_type: "ADDON",
      addon_option_id: "addon-a",
    });
    const secondVoucher = baseVoucher({
      qr_token: "addon-voucher-b",
      voucher_type: "ADDON",
      addon_option_id: "addon-a",
      eligible_addon_options: [
        { addon_option_id: "addon-a", label: "A", price_vnd: 8_000, is_active: true, is_dynamic_gram: false },
        { addon_option_id: "addon-b", label: "B", price_vnd: 10_000, is_active: true, is_dynamic_gram: false },
      ],
    });
    const item = projectedCartLine({
      cartId: "line-1",
      selectedOptionIds: ["addon-a", "addon-b"],
      addonPrices: { "addon-a": 8_000, "addon-b": 10_000 },
      addonsPrice: 18_000,
      addonVouchers: [{ voucherId: firstVoucher.qr_token, addonOptionId: "addon-a", discountVnd: 8_000 }],
    });

    expect(resolveAddonVoucherOptionId(secondVoucher, item.selectedOptionIds, ["addon-a"])).toBe("addon-b");
    expect(resolveAddonVoucherOptionForCartItem(secondVoucher, item)).toBe("addon-b");
    expect(buildAddonVoucherMap([secondVoucher], [item]).get(item.cartId)).toEqual([secondVoucher]);
    expect(getCartAddonVoucherTargets(projectedCartLine({
      ...item,
      addonVouchers: [
        { voucherId: firstVoucher.qr_token, addonOptionId: "addon-a", discountVnd: 8_000 },
        { voucherId: secondVoucher.qr_token, addonOptionId: "addon-b", discountVnd: 10_000 },
      ],
    }))).toEqual({ "addon-voucher-a": "addon-a", "addon-voucher-b": "addon-b" });
    expect(hasAddonVoucherForOption(item, "addon-a")).toBe(true);
    expect(hasAddonVoucherForOption(item, "addon-b")).toBe(false);
  });

  it("trả toàn bộ ADDON target trên cùng ly kèm đúng mức giảm để UI yêu cầu khách chọn", () => {
    const voucher = baseVoucher({
      voucher_type: "ADDON",
      addon_option_id: "addon-a",
      eligible_addon_options: [
        { addon_option_id: "addon-a", label: "A", price_vnd: 5_000, is_active: true, is_dynamic_gram: false },
        { addon_option_id: "addon-b", label: "B", price_vnd: 15_000, is_active: true, is_dynamic_gram: false },
      ],
    });
    expect(getAddonVoucherTargetChoices(
      voucher,
      ["addon-a", "addon-b"],
      [],
      { "addon-a": 5_000, "addon-b": 15_000 },
    )).toEqual([
      { addonOptionId: "addon-a", label: "A", discountVnd: 5_000 },
      { addonOptionId: "addon-b", label: "B", discountVnd: 15_000 },
    ]);
  });

  it("nhận ITEM voucher đang gắn trên extra là voucher menu đã dùng", () => {
    const item = projectedCartLine({ cartId: "extra-1", category: "extras", size: null, itemVoucherId: "item-voucher" });
    expect(getAppliedMenuVoucherId(item)).toBe("item-voucher");
  });

  it("chỉ cập nhật addon ID khi thêm hoặc thay fixed addon", () => {
    const source = { ...drink({
      unitPrice: 70_000,
      selectedOptionIds: ["addon-a"],
      addonsPrice: 5_000,
      addonPrices: { "addon-a": 5_000 },
      addonMetadata: { "addon-a": { addon_group_id: "topping", max_select: 1, gram_value: null } },
      clientPriceVnd: 70_000,
      originalClientPriceVnd: 70_000,
    }), cartId: "line" };
    const result = configureFixedAddon(source, {
      addonOptionId: "addon-b",
      priceVnd: 10_000,
      addonGroupId: "topping",
      maxSelect: 1,
      replaceOptionId: "addon-a",
    });
    expect(result.configuration.size === null ? [] : result.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(result).not.toHaveProperty("addonPrices");
    expect(result).not.toHaveProperty("unitPrice");
    expect(result).not.toHaveProperty("clientPriceVnd");
  });

  it("cấu hình topping và gắn voucher trong cùng một cart snapshot", () => {
    const result = attachPendingAddonVoucher(drink({
      unitPrice: 70_000,
      selectedOptionIds: ["addon-a"],
      addonsPrice: 5_000,
      addonPrices: { "addon-a": 5_000 },
      addonMetadata: { "addon-a": { addon_group_id: "topping", max_select: 1, gram_value: null } },
      originalClientPriceVnd: 70_000,
      clientPriceVnd: 70_000,
    }), {
      voucherId: "addon-voucher",
      addonOptionId: "addon-b",
      priceVnd: 15_000,
      addonGroupId: "topping",
      maxSelect: 1,
      groupOptionIds: ["addon-a", "addon-b"],
      isExtraMatcha: false,
    }, "addon-a");

    expect(result.configuration.size === null ? [] : result.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(result.addonVouchers).toEqual([{ token: "addon-voucher", addonOptionId: "addon-b" }]);
    expect(result).not.toHaveProperty("addonsPrice");
    expect(result).not.toHaveProperty("clientPriceVnd");
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("attaches one pending ADDON voucher unit and preserves the remaining quantity in %s cart", (_label, store) => {
    store.getState().setPendingAddonVoucher({ voucherId: "addon-voucher", addonOptionId: "addon-b", priceVnd: 10_000, addonGroupId: "topping", maxSelect: 1, groupOptionIds: ["addon-a", "addon-b"], isExtraMatcha: false });
    store.getState().addItem(drink({ quantity: 2 }));
    const items = store.getState().items;
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.quantity)).toEqual([1, 1]);
    const voucherItem = items.find((item) => item.addonVouchers.some((voucher) => voucher.token === "addon-voucher"));
    expect(voucherItem?.configuration.size === null ? [] : voucherItem?.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(voucherItem).not.toHaveProperty("unitPrice");
    expect(store.getState().pendingAddonVoucher).toBeNull();
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("preserves another addon voucher when pending ADDON attaches in %s cart", (_label, store) => {
    store.getState().setPendingAddonVoucher({ voucherId: "pending-voucher", addonOptionId: "addon-b", priceVnd: 10_000, addonGroupId: "topping-b", maxSelect: 1, groupOptionIds: ["addon-b"], isExtraMatcha: false });
    store.getState().addItem(drink({
      unitPrice: 70_000,
      selectedOptionIds: ["addon-a"],
      addonsPrice: 5_000,
      addonPrices: { "addon-a": 5_000 },
      addonMetadata: { "addon-a": { addon_group_id: "topping-a", max_select: 1, gram_value: null } },
      addonVouchers: [{ voucherId: "existing-voucher", addonOptionId: "addon-a", discountVnd: 5_000 }],
      clientPriceVnd: 65_000,
      originalClientPriceVnd: 70_000,
    }));

    const stored = store.getState().items[0];
    expect(!stored || stored.configuration.size === null ? [] : stored.configuration.addonOptionIds).toEqual(["addon-a", "addon-b"]);
    expect(stored?.addonVouchers).toEqual([
      { token: "existing-voucher", addonOptionId: "addon-a" },
      { token: "pending-voucher", addonOptionId: "addon-b" },
    ]);
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("keeps at most one voucher allocation per addon option in %s cart", (_label, store) => {
    const added = store.getState().addItem(drink({
      selectedOptionIds: ["addon-a"],
      addonsPrice: 8_000,
      addonPrices: { "addon-a": 8_000 },
      originalClientPriceVnd: 73_000,
      clientPriceVnd: 73_000,
    }));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    store.getState().applyAddonVoucher(added.value.cartId, "voucher-one", "addon-a");
    store.getState().applyAddonVoucher(added.value.cartId, "voucher-two", "addon-a");
    expect(store.getState().items[0]?.addonVouchers).toEqual([
      { token: "voucher-two", addonOptionId: "addon-a" },
    ]);
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("blocks a fully BUNDLE-allocated unit but can split one outside unit in %s cart", (_label, store) => {
    const added = store.getState().addItem(drink({
      quantity: 2,
      unitPrice: 80_000,
      selectedOptionIds: ["addon-b"],
      addonsPrice: 15_000,
      addonPrices: { "addon-b": 15_000 },
      originalClientPriceVnd: 80_000,
      clientPriceVnd: 80_000,
    }));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const cartId = added.value.cartId;
    store.getState().commitBundleApplication({
      voucher_qr_token: "bundle-voucher",
      owner_key: "customer:test",
      qualifier_allocations: [{ client_line_id: cartId, quantity: 1 }],
      reward_allocations: [],
      created_reward_effects: [],
    });

    const applied = store.getState().applyAddonVoucher(cartId, "addon-voucher", "addon-b");
    expect(applied.ok).toBe(true);
    expect(store.getState().items).toHaveLength(2);
    expect(store.getState().items[0]).toMatchObject({ cartId, quantity: 1 });
    expect(store.getState().items[0]?.addonVouchers ?? []).toEqual([]);
    expect(store.getState().items[1]).toMatchObject({
      quantity: 1,
      addonVouchers: [{ token: "addon-voucher", addonOptionId: "addon-b" }],
    });

    const before = store.getState().items;
    const blocked = store.getState().applyAddonVoucher(cartId, "blocked-voucher", "addon-b");
    expect(blocked).toMatchObject({ ok: false, code: "BUNDLE_ALLOCATED" });
    expect(store.getState().items).toBe(before);
  });

  it("does not consume a pending ADDON voucher when the next added item is extras", () => {
    useCartStore.getState().setPendingAddonVoucher({ voucherId: "addon-voucher", addonOptionId: "addon-b", priceVnd: 10_000, addonGroupId: "topping", maxSelect: 1, groupOptionIds: ["addon-a", "addon-b"], isExtraMatcha: false });
    useCartStore.getState().addItem(drink({ category: "extras", size: null, unitPrice: 20_000, clientPriceVnd: 20_000, originalClientPriceVnd: 20_000 }));
    expect(useCartStore.getState().pendingAddonVoucher?.voucherId).toBe("addon-voucher");
    expect(useCartStore.getState().items[0]?.addonVouchers).toEqual([]);
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("moves one scoped PRODUCT token to the newly added reward line in %s cart", (_label, store) => {
    const firstResult = store.getState().addItem(drink({
      menuItemId: "drink-a",
      productVoucherId: "product-voucher",
      productVoucherType: "PRODUCT",
      productVoucherDiscountVnd: 45_000,
      clientPriceVnd: 20_000,
    }));
    const secondResult = store.getState().addItem(drink({
      productVoucherId: "product-voucher",
      productVoucherType: "PRODUCT",
      productVoucherDiscountVnd: 58_000,
      clientPriceVnd: 7_000,
    }));

    expect(firstResult.ok && secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    const first = store.getState().items.find((item) => item.cartId === firstResult.value.cartId);
    const second = store.getState().items.find((item) => item.cartId === secondResult.value.cartId);
    expect(first?.lineVoucher).toBeUndefined();
    expect(second?.lineVoucher).toEqual({ token: "product-voucher", kind: "PRODUCT" });
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("moves a pending ADDON token off its previous line without removing PRODUCT in %s cart", (_label, store) => {
    const firstResult = store.getState().addItem(drink({
      unitPrice: 75_000,
      selectedOptionIds: ["addon-b"],
      addonsPrice: 10_000,
      addonPrices: { "addon-b": 10_000 },
      addonMetadata: { "addon-b": { addon_group_id: "topping", max_select: 1, gram_value: null } },
      addonVouchers: [{ voucherId: "addon-voucher", addonOptionId: "addon-b", discountVnd: 10_000 }],
      productVoucherId: "product-voucher",
      productVoucherType: "PRODUCT",
      productVoucherDiscountVnd: 40_000,
      clientPriceVnd: 25_000,
      originalClientPriceVnd: 75_000,
    }));
    store.getState().setPendingAddonVoucher({
      voucherId: "addon-voucher",
      addonOptionId: "addon-b",
      priceVnd: 10_000,
      addonGroupId: "topping",
      maxSelect: 1,
      groupOptionIds: ["addon-a", "addon-b"],
      isExtraMatcha: false,
    });
    const secondResult = store.getState().addItem(drink());

    expect(firstResult.ok && secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    const first = store.getState().items.find((item) => item.cartId === firstResult.value.cartId);
    const second = store.getState().items.find((item) => item.cartId === secondResult.value.cartId);
    expect(first?.lineVoucher).toEqual({ token: "product-voucher", kind: "PRODUCT" });
    expect(first?.addonVouchers).toEqual([]);
    expect(second?.addonVouchers).toEqual([
      { token: "addon-voucher", addonOptionId: "addon-b" },
    ]);
  });

  it("từ chối pending ADDON thiếu context nhóm thay vì âm thầm vượt max_select", () => {
    const transition = applyCartCommand({
      items: [],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
    }, {
      type: "ADD_LINE_WITH_ADDON",
      line: drink(),
      voucherToken: "addon-voucher",
      addonOptionId: "addon-b",
      groupOptionIds: [],
      maxSelect: 1,
      isExtraMatcha: false,
    });

    expect(transition.result).toMatchObject({ ok: false, code: "ADDON_NOT_SELECTED" });
    expect(transition.state.items).toEqual([]);
  });

  it.each([
    ["customer", useCartStore],
    ["staff", useStaffCartStore],
  ] as const)("giữ pending ADDON khi nhóm cùng topping đã đủ trong %s cart", (_label, store) => {
    const pending = {
      voucherId: "pending-voucher",
      addonOptionId: "addon-b",
      priceVnd: 10_000,
      addonGroupId: "topping",
      maxSelect: 1,
      groupOptionIds: ["addon-a", "addon-b"],
      isExtraMatcha: false,
    };
    store.getState().setPendingAddonVoucher(pending);

    const result = store.getState().addItem(drink({
      selectedOptionIds: ["addon-a"],
      addonPrices: { "addon-a": 5_000 },
      addonsPrice: 5_000,
      originalClientPriceVnd: 70_000,
      clientPriceVnd: 70_000,
    }));

    expect(result).toMatchObject({ ok: false, code: "ADDON_GROUP_FULL" });
    expect(store.getState().items).toEqual([]);
    expect(store.getState().pendingAddonVoucher).toEqual(pending);
  });

  it("xóa pending ADDON khi voucher không còn hợp lệ", () => {
    useStaffCartStore.getState().setPendingAddonVoucher({
      voucherId: "expired-addon",
      addonOptionId: "addon-b",
      priceVnd: 10_000,
      addonGroupId: "topping",
      maxSelect: 1,
      groupOptionIds: ["addon-a", "addon-b"],
      isExtraMatcha: false,
    });

    expect(useStaffCartStore.getState().removeVoucherEffects("expired-addon").ok).toBe(true);
    expect(useStaffCartStore.getState().pendingAddonVoucher).toBeNull();
  });
});
