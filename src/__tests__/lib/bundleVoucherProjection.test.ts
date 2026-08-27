import { describe, expect, it } from "vitest";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartBundleApplication, CartItem } from "@/src/lib/types/cart";
import { projectBundleApplications, projectCartTotals } from "@/src/lib/utils/bundleVoucherProjection";
import type { MyVoucher } from "@/src/services/customerVoucherService";

function makeItem(quantity = 2): CartItem {
  return {
    cartId: "line-1", menuItemId: "matcha", name: "Matcha", category: "latte", imageUrl: null,
    size: "MEDIUM", unitPrice: 50_000, quantity, sweetness: "QUARTER", iceOption: "NORMAL",
    coldwhisk: false, note: "", selectedOptionIds: [], quantityMap: {}, addonsPrice: 0,
    addonPrices: {}, quantityAddonOptions: [], clientPriceVnd: 50_000, originalClientPriceVnd: 50_000,
  };
}

function makeBundleVoucher(token: string): MyVoucher {
  return {
    qr_token: token, voucher_type: "BUNDLE", status: "ACTIVE", min_order_vnd: null,
    package: {
      name: "Mua 1 tặng 1",
      bundleRule: {
        buy_quantity: 1, reward_quantity: 1, reward_kind: "PRODUCT", reward_mode: "SAME_CONFIG",
        benefit_scaling: "PER_BUNDLE", max_applications_per_order: 1, max_reward_units_per_order: null,
        qualifier_products: [{ menu_item_id: "matcha", allowed_sizes: ["MEDIUM"], default_powder_id: null, default_base_liquid_id: null, menu_item: { name: "Matcha", category: "latte", is_available: true } }],
        reward_products: [], reward_addon_option_ids: [],
      },
    },
  } as unknown as MyVoucher;
}

function app(token: string): CartBundleApplication {
  return {
    voucher_qr_token: token, owner_key: "customer:0901",
    qualifier_allocations: [{ client_line_id: "line-1", quantity: 1 }],
    reward_allocations: [{ client_line_id: "line-1", quantity: 1 }],
    created_reward_effects: [], status: "READY",
  };
}

describe("BUNDLE client projection", () => {
  it("không báo READY khi hai token dùng quá số đơn vị của cùng cart line", () => {
    const projection = projectBundleApplications(
      [makeItem(2)], [app("bundle-a"), app("bundle-b")], [makeBundleVoucher("bundle-a"), makeBundleVoucher("bundle-b")],
    );

    expect(projection.error_by_token.get("bundle-a")).toContain("allocated");
    expect(projection.error_by_token.get("bundle-b")).toContain("allocated");
  });

  it("trừ BUNDLE trước mã giảm đơn và giữ tiền theo VND chính xác", () => {
    const discount = {
      qr_token: "discount", voucher_type: "DISCOUNT", status: "ACTIVE", discount_type: "FIXED", discount_value: 10_000,
      min_order_vnd: null, package: { name: "Giảm 10k" },
    } as unknown as MyVoucher;
    const projection = projectCartTotals({
      items: [makeItem(2)], applications: [app("bundle-a")], vouchers: [makeBundleVoucher("bundle-a"), discount],
      selectedVoucherIds: ["discount"], shipping_fee_vnd: 0,
    });

    expect(projection.bundles.bundle_discount_vnd).toBe(50_000);
    expect(projection.totals.subtotal_vnd).toBe(100_000);
    expect(projection.totals.total_voucher_discount_vnd).toBe(10_000);
    expect(projection.totals.grand_total_vnd).toBe(40_000);
  });
});

describe("BUNDLE ownership rehydrate", () => {
  it("đổi owner gỡ application và chỉ reward line do BUNDLE tạo", () => {
    const paid = makeItem(1);
    const generated = { ...makeItem(1), cartId: "generated" };
    useCartStore.setState({
      items: [paid, generated],
      bundleApplications: [{ ...app("bundle-a"), created_reward_effects: [{ kind: "LINE", client_line_id: "generated" }] }],
    });

    useCartStore.getState().reconcileBundleApplications("customer:other");

    expect(useCartStore.getState().bundleApplications).toEqual([]);
    expect(useCartStore.getState().items.map((item) => item.cartId)).toEqual(["line-1"]);
  });
});
