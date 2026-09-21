import { describe, expect, it } from "vitest";
import { toOrderItemDetail } from "@/lib/orderPublicDto";

describe("order public DTO", () => {
  it("allowlists nested order-item fields and removes persisted IDs", () => {
    const item = toOrderItemDetail({
      id: "private-order-item-id",
      order_id: "private-order-id",
      product_voucher_id: "private-product-voucher-id",
      item_voucher_id: "private-item-voucher-id",
      menu_item_id: "menu-1",
      quantity: 1,
      unit_price_vnd: 42_000,
      addons_price_vnd: 8_000,
      total_discount_vnd: 8_000,
      product_voucher_discount_vnd: 0,
      size: "MEDIUM",
      sweetness: "HALF",
      ice_option: "NORMAL",
      coldwhisk: false,
      note: null,
      selected_powder_id: null,
      selected_milk_type_id: null,
      base_liquid_ml: 150,
      menuItem: { name: "Matcha latte", category: "latte" },
      selectedPowder: null,
      milkType: null,
      addons: [{
        id: "private-addon-id",
        order_item_id: "private-order-item-id",
        addon_option_id: "addon-1",
        unit_price_vnd: 8_000,
        quantity: 1,
        addonOption: {
          label: "Kem",
          gram_value: null,
          price_vnd: 8_000,
          group: { name: "Kem" },
        },
      }],
      productVoucher: {
        id: "private-voucher-id",
        package_id: "private-package-id",
        package: { name: "Free matcha" },
      },
      itemVoucher: null,
      addonVouchers: [{
        id: "private-link-id",
        order_item_id: "private-order-item-id",
        voucher_id: "private-addon-voucher-id",
        discount_applied_vnd: 8_000,
        voucher: {
          id: "private-addon-voucher-id",
          package_id: "private-addon-package-id",
          package: { name: "Free kem" },
        },
      }],
    });

    expect(item).toEqual(expect.objectContaining({
      menu_item_id: "menu-1",
      base_liquid_ml: 150,
      productVoucher: { package: { name: "Free matcha" } },
      addonVouchers: [{
        discount_applied_vnd: 8_000,
        voucher: { package: { name: "Free kem" } },
      }],
    }));
    expect(item).not.toHaveProperty("id");
    expect(item).not.toHaveProperty("order_id");
    expect(item).not.toHaveProperty("product_voucher_id");
    expect(item.addons[0]).not.toHaveProperty("id");
    expect(item.addons[0]).not.toHaveProperty("order_item_id");
    expect(item.addonVouchers?.[0]).not.toHaveProperty("voucher_id");
    expect(item.addonVouchers?.[0].voucher).not.toHaveProperty("id");
  });
});
