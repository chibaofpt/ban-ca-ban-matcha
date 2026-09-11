import { describe, expect, it } from "vitest";
import type { CartBundleApplication } from "@/src/lib/types/cart";
import { projectedCartLine } from "@/src/__tests__/fixtures/cart";
import type { BundleSelectionAllocation } from "@/src/lib/utils/bundleVoucher";
import { getBundleAllocatedQuantities, getBundleCartDisplayTotals } from "@/src/lib/utils/bundleCartSummary";

function item(
  cartId: string,
  quantity: number,
  originalClientPriceVnd: number,
  addonsPrice = 0,
  addonPrices: Record<string, number> = {},
) {
  return projectedCartLine({
    cartId,
    menuItemId: `menu-${cartId}`,
    name: cartId,
    category: "latte",
    imageUrl: null,
    size: "MEDIUM",
    unitPrice: originalClientPriceVnd,
    quantity,
    sweetness: "FULL",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    selectedOptionIds: Object.keys(addonPrices),
    addonsPrice,
    addonPrices,
    clientPriceVnd: originalClientPriceVnd,
    originalClientPriceVnd,
  });
}

function productAllocation(client_line_id: string, quantity: number): BundleSelectionAllocation {
  return { client_line_id, quantity };
}

describe("bundle cart display totals", () => {
  it("leaves outside units selectable when one shared line is allocated", () => {
    const application: CartBundleApplication = {
      voucher_qr_token: "bundle-1",
      owner_key: "customer:test",
      qualifier_allocations: [productAllocation("shared", 1)],
      reward_allocations: [{ client_line_id: "shared", addon_option_id: "topping", quantity: 1 }],
      created_reward_effects: [],
    };
    const allocated = getBundleAllocatedQuantities([application]).get("shared") ?? 0;
    expect(allocated).toBe(1);
    expect(allocated < 3).toBe(true);
  });

  it("summarizes product rewards and paid qualifier toppings", () => {
    const totals = getBundleCartDisplayTotals(
      [item("buy", 1, 55_000, 5_000), item("gift", 1, 45_000)],
      [productAllocation("buy", 1), productAllocation("gift", 1)],
      45_000,
    );
    expect(totals).toEqual({ grossVnd: 100_000, discountVnd: 45_000, netVnd: 55_000, paidToppingsVnd: 5_000 });
  });

  it("counts an addon reward once and removes it from paid toppings", () => {
    const totals = getBundleCartDisplayTotals(
      [item("buy", 1, 55_000, 5_000, { topping: 5_000 })],
      [productAllocation("buy", 1), { client_line_id: "buy", addon_option_id: "topping", quantity: 1 }],
      5_000,
    );
    expect(totals).toEqual({ grossVnd: 55_000, discountVnd: 5_000, netVnd: 50_000, paidToppingsVnd: 0 });
  });

  it("includes an addon recipient cup and its free topping exactly once", () => {
    const totals = getBundleCartDisplayTotals(
      [item("qualifier", 1, 50_000), item("recipient", 1, 55_000, 5_000, { topping: 5_000 })],
      [productAllocation("qualifier", 1), { client_line_id: "recipient", addon_option_id: "topping", quantity: 1 }],
      5_000,
    );
    expect(totals).toEqual({ grossVnd: 105_000, discountVnd: 5_000, netVnd: 100_000, paidToppingsVnd: 0 });
  });

  it("keeps paid addons on a rewarded line in the net total", () => {
    const totals = getBundleCartDisplayTotals(
      [item("buy", 1, 55_000, 5_000), item("gift", 1, 47_000, 7_000)],
      [productAllocation("buy", 1), productAllocation("gift", 1)],
      40_000,
    );
    expect(totals).toEqual({ grossVnd: 102_000, discountVnd: 40_000, netVnd: 62_000, paidToppingsVnd: 12_000 });
  });

  it("uses only allocated units when a cart line also has outside quantity", () => {
    const totals = getBundleCartDisplayTotals(
      [item("shared", 3, 42_000, 2_000)],
      [productAllocation("shared", 1)],
      10_000,
    );
    expect(totals).toEqual({ grossVnd: 42_000, discountVnd: 10_000, netVnd: 32_000, paidToppingsVnd: 2_000 });
  });

  it("caps discount at allocated gross", () => {
    const totals = getBundleCartDisplayTotals(
      [item("gift", 1, 30_000)],
      [productAllocation("gift", 1)],
      80_000,
    );
    expect(totals).toEqual({ grossVnd: 30_000, discountVnd: 30_000, netVnd: 0, paidToppingsVnd: 0 });
  });

  it("reserves one physical cup for repeated addon options within an application", () => {
    const allocated = getBundleAllocatedQuantities([{
      voucher_qr_token: "bundle-addon-1",
      owner_key: "customer:test",
      qualifier_allocations: [],
      reward_allocations: [
        { client_line_id: "cup", addon_option_id: "topping-a", quantity: 1 },
        { client_line_id: "cup", addon_option_id: "topping-b", quantity: 1 },
      ],
      created_reward_effects: [],
    }]);
    expect(allocated.get("cup")).toBe(1);
  });

  it("sums reserved cups across separate applications", () => {
    const allocated = getBundleAllocatedQuantities([
      {
        voucher_qr_token: "bundle-addon-1",
        owner_key: "customer:test",
        qualifier_allocations: [],
        reward_allocations: [{ client_line_id: "cup", addon_option_id: "topping-a", quantity: 1 }],
        created_reward_effects: [],
      },
      {
        voucher_qr_token: "bundle-addon-2",
        owner_key: "customer:test",
        qualifier_allocations: [],
        reward_allocations: [{ client_line_id: "cup", addon_option_id: "topping-b", quantity: 1 }],
        created_reward_effects: [],
      },
    ]);
    expect(allocated.get("cup")).toBe(2);
  });
});
