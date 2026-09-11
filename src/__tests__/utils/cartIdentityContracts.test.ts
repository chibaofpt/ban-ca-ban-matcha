import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "@/src/lib/store/cartStore";
import { useStaffCartStore } from "@/src/lib/store/staffCartStore";
import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";

const paidLine: CartItem = {
  cartId: "paid",
  menuItemId: "drink",
  quantity: 1,
  configuration: {
    size: "MEDIUM", sweetness: "FULL", iceOption: "NORMAL", coldwhisk: false, note: "",
    addonOptionIds: ["paid-addon", "reward-addon"],
  },
  lineVoucher: { token: "product", kind: "PRODUCT" },
  addonVouchers: [{ token: "addon-voucher", addonOptionId: "paid-addon" }],
};

const rewardLine: CartItem = {
  ...paidLine,
  cartId: "reward",
  lineVoucher: undefined,
  addonVouchers: [],
};

const bundle: CartBundleApplication = {
  voucher_qr_token: "bundle",
  owner_key: "old-owner",
  qualifier_allocations: [{ client_line_id: "paid", quantity: 1 }],
  reward_allocations: [
    { client_line_id: "reward", quantity: 1 },
    { client_line_id: "paid", addon_option_id: "reward-addon", quantity: 1 },
  ],
  created_reward_effects: [
    { kind: "LINE", client_line_id: "reward" },
    { kind: "ADDON", client_line_id: "paid", addon_option_id: "reward-addon", quantity: 1 },
  ],
};

beforeEach(() => {
  useCartStore.setState({
    items: [], selectedOrderVoucherTokens: [], selectedVoucherIds: [], voucherOwnerKey: null,
    bundleApplications: [], pendingAddonVoucher: null, bundleRuntime: {}, persistenceWarning: null,
  });
  useStaffCartStore.setState({
    items: [], selectedOrderVoucherTokens: [], selectedDiscountIds: [], customerQrToken: null,
    customerInfo: null, bundleApplications: [], pendingAddonVoucher: null, bundleRuntime: {},
    discountVoucher: null, persistenceWarning: null,
  });
});

describe("cart identity detach", () => {
  it("customer account switch keeps paid lines and removes every old-owner effect", () => {
    useCartStore.setState({
      items: [paidLine, rewardLine], selectedOrderVoucherTokens: ["discount"], selectedVoucherIds: ["discount"],
      voucherOwnerKey: "old-owner", bundleApplications: [bundle],
    });
    const result = useCartStore.getState().detachVoucherOwner("new-owner");
    expect(result.ok).toBe(true);
    expect(useCartStore.getState()).toMatchObject({
      voucherOwnerKey: "new-owner", selectedOrderVoucherTokens: [], bundleApplications: [],
      items: [{ cartId: "paid", addonVouchers: [], configuration: { addonOptionIds: ["paid-addon"] } }],
    });
    expect(useCartStore.getState().items[0]).not.toHaveProperty("lineVoucher", expect.objectContaining({ token: "product" }));
  });

  it("customer reconcile removes a bundle whose owner does not match the normalized phone", () => {
    useCartStore.setState({
      items: [paidLine, rewardLine],
      voucherOwnerKey: "+84900000000",
      bundleApplications: [bundle],
    });

    const result = useCartStore.getState().reconcileBundleApplications("+84900000000");

    expect(result.ok).toBe(true);
    expect(useCartStore.getState().bundleApplications).toEqual([]);
    expect(useCartStore.getState().items.map((item) => item.cartId)).toEqual(["paid"]);
  });

  it("staff logout clears customer identity/vouchers without clearing paid lines", () => {
    useStaffCartStore.setState({
      items: [paidLine, rewardLine], selectedOrderVoucherTokens: ["discount"], selectedDiscountIds: ["discount"],
      customerQrToken: "customer-qr", customerInfo: { type: "existing", data: {
        qr_token: "customer-qr", name: "Customer", phone_number: "+84900000000", points_balance: 10,
      } },
      bundleApplications: [bundle],
    });
    const result = useStaffCartStore.getState().detachCustomer();
    expect(result.ok).toBe(true);
    expect(useStaffCartStore.getState()).toMatchObject({
      customerQrToken: null, customerInfo: null, selectedOrderVoucherTokens: [], bundleApplications: [],
      items: [{ cartId: "paid", addonVouchers: [], configuration: { addonOptionIds: ["paid-addon"] } }],
    });
  });
});
