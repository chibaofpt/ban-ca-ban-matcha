import { describe, expect, it } from "vitest";
import { getBundleVoucherSummary } from "@/src/components/menu/cart/CartBundleVoucherPanel";
import type { MyVoucher } from "@/src/services/customerVoucherService";

describe("BUNDLE trong luồng áp voucher hợp nhất", () => {
  it("đọc rule trực tiếp từ package, không qua Promotion", () => {
    const voucher = {
      qr_token: "bundle-token",
      package: {
        name: "Mua 2 tặng 1",
        bundleRule: {
          buy_quantity: 2,
          reward_quantity: 1,
          reward_kind: "PRODUCT",
          reward_mode: "SAME_CONFIG",
          benefit_scaling: "PER_BUNDLE",
          max_applications_order: 1,
          max_reward_units_order: null,
          productScopes: [{ role: "QUALIFIER", menu_item_id: "latte-1" }],
          addonRewards: [],
        },
      },
    } as unknown as MyVoucher;

    expect(getBundleVoucherSummary(voucher)).toEqual(expect.objectContaining({
      buy_quantity: 2,
      eligible_menu_item_ids: ["latte-1"],
    }));
  });
});
