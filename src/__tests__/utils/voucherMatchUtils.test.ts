import { describe, expect, it } from "vitest";
import { buildProductVoucherMap } from "@/src/utils/voucherMatchUtils";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CartItem } from "@/src/lib/types/cart";

function voucher(voucherType: MyVoucher["voucher_type"]): MyVoucher {
  return {
    qr_token: `token-${voucherType}`, voucher_type: voucherType, discount_type: null,
    discount_value: null, menu_item_id: "legacy-item", eligible_menu_items: [], eligible_sizes: ["MEDIUM"],
    size: "MEDIUM", matcha_powder_id: null, milk_type_id: null, included_addon_option_ids: [],
    addon_option_id: null, covered_price_vnd: 50_000, covered_delivery_fee_vnd: null,
    min_order_vnd: null, status: "ACTIVE", used_channel: null, expires_at: null,
    redeemed_at: null, created_at: new Date().toISOString(), package: { name: "Voucher", description: null, points_cost: 1 },
    menuItem: null, addonOption: null, staff: null,
    availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
  };
}

const cartItem = {
  cartId: "cart", menuItemId: "legacy-item", name: "Món", category: "latte", imageUrl: null,
  size: "MEDIUM", unitPrice: 50_000, quantity: 1, sweetness: "FULL", iceOption: "NORMAL",
  coldwhisk: false, note: "", selectedOptionIds: [], quantityMap: {}, addonsPrice: 0,
  addonPrices: {}, quantityAddonOptions: [], clientPriceVnd: 50_000, originalClientPriceVnd: 50_000,
} satisfies CartItem;

describe("Fallback scope voucher ở cart", () => {
  it.each(["PRODUCT", "ITEM", "PRODUCT_DISCOUNT"] as const)("%s fallback menu_item_id khi eligible_menu_items rỗng", (type) => {
    expect(buildProductVoucherMap([voucher(type)], [cartItem]).get("legacy-item")).toHaveLength(1);
  });
});
