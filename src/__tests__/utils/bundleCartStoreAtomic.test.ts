import { beforeEach, describe, expect, it } from "vitest";
import type { BundleCartDraftCommit, CartBundleApplication } from "@/src/lib/types/cart";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import { removeBundleEffects, useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";

const item = (cartId: string) => projectedCartLine({
  cartId,
  menuItemId: "latte-1",
  name: "Latte",
  category: "latte",
  imageUrl: null,
  size: "MEDIUM",
  unitPrice: 45_000,
  quantity: 1,
  sweetness: "QUARTER",
  iceOption: "NORMAL",
  coldwhisk: false,
  note: "",
  selectedOptionIds: [],
  addonsPrice: 0,
  addonPrices: {},
  clientPriceVnd: 45_000,
  originalClientPriceVnd: 45_000,
});

const application = (token: string, effectLine: string): CartBundleApplication => ({
  voucher_qr_token: token,
  owner_key: "customer:84901234567",
  qualifier_allocations: [{ client_line_id: "buy-1", quantity: 1 }],
  reward_allocations: [{ client_line_id: effectLine, quantity: 1 }],
  created_reward_effects: [{ kind: "LINE", client_line_id: effectLine }],
});

const commit = (token: string): BundleCartDraftCommit => ({
  items: [item("buy-1"), item("old-reward"), item("new-reward")],
  application: application(token, "new-reward"),
});

describe("commitBundleCartDraft — mutation nguyên tử", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], bundleApplications: [] });
    useStaffCartStore.setState({ items: [], bundleApplications: [] });
  });

  it("thay items và application trong một commit, chỉ xoá reward effect cũ", () => {
    useCartStore.setState({
      items: [item("buy-1"), item("old-reward")],
      bundleApplications: [application("bundle-1", "old-reward")],
    });

    useCartStore.getState().commitBundleCartDraft(commit("bundle-1"));

    expect(useCartStore.getState().items.map((entry) => entry.cartId)).toEqual(commit("bundle-1").items.map((entry) => entry.cartId));
    expect(useCartStore.getState().bundleApplications).toEqual([commit("bundle-1").application]);
  });

  it("giữ cùng semantics cho staff cart", () => {
    useStaffCartStore.setState({
      items: [item("buy-1"), item("old-reward")],
      bundleApplications: [application("bundle-1", "old-reward")],
    });

    useStaffCartStore.getState().commitBundleCartDraft(commit("bundle-1"));

    expect(useStaffCartStore.getState().items.map((entry) => entry.cartId)).toEqual(commit("bundle-1").items.map((entry) => entry.cartId));
    expect(useStaffCartStore.getState().bundleApplications).toEqual([commit("bundle-1").application]);
  });

  it("gỡ đúng effect addon của token và không cần marker trên cart line", () => {
    const fixture = projectedCartLine({
      ...item("buy-1"),
      selectedOptionIds: ["addon-a", "addon-b"],
      addonsPrice: 20_000,
      addonPrices: { "addon-a": 10_000, "addon-b": 10_000 },
    });
    const items = [{
      cartId: fixture.cartId,
      menuItemId: fixture.menuItemId,
      quantity: fixture.quantity,
      configuration: fixture.configuration,
      addonVouchers: [],
    }];
    const application: CartBundleApplication = {
      ...applicationForEffects("bundle-1"),
      created_reward_effects: [{ kind: "ADDON", client_line_id: "buy-1", addon_option_id: "addon-a", quantity: 1 }],
    };

    const remaining = removeBundleEffects(items, application);
    expect(remaining[0]?.configuration.size === null ? [] : remaining[0]?.configuration.addonOptionIds).toEqual(["addon-b"]);
    expect(remaining[0]).not.toHaveProperty("addonsPrice");
    expect(remaining[0]).not.toHaveProperty("unitPrice");
    expect(remaining[0]).not.toHaveProperty("addonPrices");
    expect(remaining[0]).not.toHaveProperty("bundleQualifierVoucherToken");
    expect(remaining[0]).not.toHaveProperty("bundleRewardVoucherToken");
  });

  it("reconcile giữ application đúng owner và loại application của owner khác", () => {
    useStaffCartStore.setState({
      items: [item("buy-1")],
      bundleApplications: [
        { ...application("mine", "buy-1"), owner_key: "staff:customer-1" },
        { ...application("foreign", "buy-1"), owner_key: "staff:customer-2" },
      ],
    });

    useStaffCartStore.getState().reconcileBundleApplications("staff:customer-1");

    expect(useStaffCartStore.getState().bundleApplications.map((entry) => entry.voucher_qr_token)).toEqual(["mine"]);
  });
});

function applicationForEffects(token: string): CartBundleApplication {
  return application(token, "buy-1");
}
