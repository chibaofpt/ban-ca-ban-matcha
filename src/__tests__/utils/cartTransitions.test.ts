import { describe, expect, it } from "vitest";
import type { CartItem, CartTransitionState } from "@/src/lib/types/cart";
import { applyCartCommand } from "@/src/lib/utils/cartTransitions";

const line = (quantity = 1): CartItem => ({
  cartId: "line-1",
  menuItemId: "drink-1",
  quantity,
  configuration: {
    size: "MEDIUM",
    sweetness: "FULL",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    addonOptionIds: [],
  },
  addonVouchers: [],
});

const state = (items: CartItem[] = [line()]): CartTransitionState => ({
  items,
  selectedOrderVoucherTokens: [],
  bundleApplications: [],
});

describe("cartTransitions", () => {
  it("thêm dòng trả cartId và cùng engine cho state kế tiếp", () => {
    const initial = state([]);
    const transition = applyCartCommand(initial, {
      type: "ADD_LINE",
      line: { ...line(), cartId: undefined },
    }, () => "generated-id");

    expect(transition.result).toEqual({ ok: true, value: { cartId: "generated-id" } });
    expect(transition.state.items[0]?.cartId).toBe("generated-id");
  });

  it("mutation lỗi giữ nguyên reference state", () => {
    const initial = state();
    const transition = applyCartCommand(initial, {
      type: "CHANGE_QUANTITY",
      cartId: "missing",
      quantity: 2,
    });

    expect(transition.result.ok).toBe(false);
    expect(transition.state).toBe(initial);
  });

  it("voucher dòng tách đúng một unit và token chỉ có một owner", () => {
    const initial = state([
      line(2),
      { ...line(), cartId: "old", lineVoucher: { token: "voucher-1", kind: "PRODUCT" } },
    ]);
    const transition = applyCartCommand(initial, {
      type: "APPLY_LINE_VOUCHER",
      cartId: "line-1",
      voucher: { token: "voucher-1", kind: "PRODUCT" },
    }, () => "split-id");

    expect(transition.result.ok).toBe(true);
    expect(transition.state.items).toEqual([
      { ...line(2), quantity: 1 },
      { ...line(), cartId: "split-id", lineVoucher: { token: "voucher-1", kind: "PRODUCT" } },
      { ...line(), cartId: "old", lineVoucher: undefined },
    ]);
  });

  it("ADDON trên unit BUNDLE thất bại nguyên khối", () => {
    const initial = {
      ...state(),
      bundleApplications: [{
        voucher_qr_token: "bundle-1",
        owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
        reward_allocations: [],
        created_reward_effects: [],
      }],
    };
    const transition = applyCartCommand(initial, {
      type: "APPLY_ADDON_VOUCHER",
      cartId: "line-1",
      voucherToken: "addon-voucher",
      addonOptionId: "addon-1",
      groupOptionIds: ["addon-1"],
      maxSelect: 1,
      isExtraMatcha: false,
    });

    expect(transition.result).toMatchObject({ ok: false, code: "BUNDLE_ALLOCATED" });
    expect(transition.state).toBe(initial);
    expect(initial.items[0]?.configuration.size === null ? [] : initial.items[0]?.configuration.addonOptionIds).toEqual([]);
  });

  it("edit line moves a voucher token from its previous owner", () => {
    const initial = state([
      line(),
      { ...line(), cartId: "old", lineVoucher: { token: "voucher", kind: "PRODUCT" } },
    ]);
    const { cartId, ...edited } = line();
    void cartId;
    const transition = applyCartCommand(initial, {
      type: "UPDATE_LINE", cartId: "line-1", line: { ...edited, lineVoucher: { token: "voucher", kind: "PRODUCT" } },
    });
    expect(transition.result.ok).toBe(true);
    expect(transition.state.items.map((item) => item.lineVoucher?.token ?? null)).toEqual(["voucher", null]);
  });

  it("moves a token between voucher roles on the same unit instead of duplicating it", () => {
    const initial = state([{
      ...line(),
      lineVoucher: { token: "shared-token", kind: "PRODUCT" },
      configuration: {
        size: "MEDIUM", sweetness: "FULL", iceOption: "NORMAL", coldwhisk: false,
        note: "", addonOptionIds: ["addon-1"],
      },
    }]);
    const transition = applyCartCommand(initial, {
      type: "APPLY_ADDON_VOUCHER",
      cartId: "line-1",
      voucherToken: "shared-token",
      addonOptionId: "addon-1",
      groupOptionIds: ["addon-1"],
      maxSelect: 1,
      isExtraMatcha: false,
    });

    expect(transition.result.ok).toBe(true);
    expect(transition.state.items[0]?.lineVoucher).toBeUndefined();
    expect(transition.state.items[0]?.addonVouchers).toEqual([
      { token: "shared-token", addonOptionId: "addon-1" },
    ]);
  });

  it("rejects an edit with an addon voucher whose topping is absent without changing state", () => {
    const initial = state();
    const { cartId, ...edited } = line();
    void cartId;
    const transition = applyCartCommand(initial, {
      type: "UPDATE_LINE",
      cartId: "line-1",
      line: { ...edited, addonVouchers: [{ token: "addon-voucher", addonOptionId: "missing-addon" }] },
    });
    expect(transition.result).toMatchObject({ ok: false, code: "ADDON_NOT_SELECTED" });
    expect(transition.state).toBe(initial);
  });
});
