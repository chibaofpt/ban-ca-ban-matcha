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
  it("keeps an automatic addon needed by a retained BUNDLE", () => {
    const recipient: CartItem = { ...line(2), cartId: "recipient", configuration: { size: "MEDIUM", sweetness: "FULL", iceOption: "NORMAL", coldwhisk: false, note: "", addonOptionIds: ["gift"] } };
    const initial: CartTransitionState = {
      ...state([{ ...line(), cartId: "buy" }, recipient]),
      bundleApplications: [{
        voucher_qr_token: "remove", owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "buy", quantity: 1 }],
        reward_allocations: [{ client_line_id: "recipient", addon_option_id: "gift", quantity: 1 }],
        created_reward_effects: [{ kind: "ADDON", client_line_id: "recipient", addon_option_id: "gift", quantity: 1 }],
      }, {
        voucher_qr_token: "retain", owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "recipient", quantity: 1 }],
        reward_allocations: [{ client_line_id: "recipient", addon_option_id: "gift", quantity: 1 }],
        created_reward_effects: [],
      }],
    };
    const result = applyCartCommand(initial, { type: "REMOVE_LINE", cartId: "buy" });
    expect(result.result.ok).toBe(true);
    expect(result.state.items).toEqual([{ ...recipient, quantity: 1 }]);
    expect(result.state.bundleApplications).toEqual([initial.bundleApplications[1]]);
  });

  it("xóa nhóm gỡ topping tự thêm trên unit còn lại, giữ topping vốn có", () => {
    const configured = { ...line(2), cartId: "buy", configuration: { ...line().configuration, size: "MEDIUM" as const, sweetness: "FULL" as const, iceOption: "NORMAL" as const, coldwhisk: false, addonOptionIds: ["existing", "gift"] } };
    const initial: CartTransitionState = { ...state([configured]), bundleApplications: [{
      voucher_qr_token: "addon", owner_key: "owner",
      qualifier_allocations: [{ client_line_id: "buy", quantity: 1 }],
      reward_allocations: [{ client_line_id: "buy", addon_option_id: "gift", quantity: 1 }],
      created_reward_effects: [{ kind: "ADDON", client_line_id: "buy", addon_option_id: "gift", quantity: 1 }],
    }] };
    const result = applyCartCommand(initial, { type: "REMOVE_LINE", cartId: "buy" });
    expect(result.result.ok).toBe(true);
    expect(result.state.items[0]?.quantity).toBe(1);
    expect(result.state.items[0]?.configuration).toMatchObject({ addonOptionIds: ["existing"] });
    expect(result.state.bundleApplications).toEqual([]);
  });

  it.each(["buy", "gift"])("xóa từ %s xóa cả BUNDLE và giữ unit ngoài nhóm", (cartId) => {
    const initial: CartTransitionState = {
      items: [{ ...line(3), cartId: "buy" }, { ...line(2), cartId: "gift" }, { ...line(), cartId: "other" }],
      selectedOrderVoucherTokens: ["order-discount"],
      bundleApplications: [{
        voucher_qr_token: "delete", owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "buy", quantity: 2 }],
        reward_allocations: [{ client_line_id: "gift", quantity: 1 }], created_reward_effects: [],
      }, {
        voucher_qr_token: "keep", owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "other", quantity: 1 }],
        reward_allocations: [], created_reward_effects: [],
      }],
    };
    const result = applyCartCommand(initial, { type: "REMOVE_LINE", cartId });
    expect(result.result.ok).toBe(true);
    expect(result.state.items.map((item) => [item.cartId, item.quantity])).toEqual([["buy", 1], ["gift", 1], ["other", 1]]);
    expect(result.state.bundleApplications).toEqual([initial.bundleApplications[1]]);
    expect(result.state.selectedOrderVoucherTokens).toEqual(["order-discount"]);
    expect(initial.items[0]?.quantity).toBe(3);
  });

  it("xóa BUNDLE topping trừ một lần ly vừa mua vừa nhận nhiều topping", () => {
    const initial: CartTransitionState = {
      ...state([{ ...line(2), cartId: "buy" }]),
      bundleApplications: [{
        voucher_qr_token: "addon", owner_key: "owner",
        qualifier_allocations: [{ client_line_id: "buy", quantity: 1 }],
        reward_allocations: [
          { client_line_id: "buy", addon_option_id: "a", quantity: 1 },
          { client_line_id: "buy", addon_option_id: "b", quantity: 1 },
        ], created_reward_effects: [],
      }],
    };
    const result = applyCartCommand(initial, { type: "REMOVE_LINE", cartId: "buy" });
    expect(result.result.ok).toBe(true);
    expect(result.state.items.map((item) => [item.cartId, item.quantity])).toEqual([["buy", 1]]);
    expect(result.state.bundleApplications).toEqual([]);
  });

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
