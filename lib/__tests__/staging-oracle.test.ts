// @vitest-environment node

import { describe, expect, it } from "vitest";
import { quoteLine, quoteOrder } from "../../scripts/staging-tests/oracle.mjs";

type OracleItem = {
  id: string; category: string; sizes: Array<{ size: string; base_price_vnd: number; base_liquid_ml?: number | null }>;
  matcha_powder_id?: string; custom_powder_grams?: null; default_powder_id?: string; default_base_liquid_id?: string; unit_price_vnd?: number;
};
const items: OracleItem[] = [
    { id: "latte", category: "latte", matcha_powder_id: "powder-a", custom_powder_grams: null, sizes: [{ size: "SMALL", base_price_vnd: 10_000, base_liquid_ml: null }] },
    { id: "latte-b", category: "latte", matcha_powder_id: "powder-b", sizes: [{ size: "SMALL", base_price_vnd: 13_000 }] },
    { id: "fusion", category: "fusion", default_powder_id: "powder-a", default_base_liquid_id: "water", sizes: [{ size: "SMALL", base_price_vnd: 12_000, base_liquid_ml: 120 }] },
    { id: "extra", category: "extras", unit_price_vnd: 7_500, sizes: [] },
];
const catalog = {
  items,
  powders: [
    { id: "powder-a", price_per_gram: 2_000, reference_latte_item_id: "latte", powderSizeConfigs: [] },
    { id: "powder-b", price_per_gram: 3_000, reference_latte_item_id: "latte-b", powderSizeConfigs: [{ size: "SMALL", grams: "4" }] },
  ],
  liquids: [{ id: "milk", is_default: true, price_per_ml: 50 }, { id: "water", is_default: false, price_per_ml: 20 }],
  defaults: [{ size: "SMALL", powder_gram: "3.5", milk_ml: 130 }],
  addonGroups: [{ id: "cream-group", options: [{ id: "cream", gram_value: null, price_vnd: 4_000 }] }, { id: "matcha-group", options: [{ id: "matcha", gram_value: "1.5", price_vnd: 0 }] }],
};

describe("Oracle staging — ví dụ số độc lập", () => {
  it("PAY_AS_SIZE dùng size tham chiếu cùng bột/liquid và giữ nguyên addon", () => {
    const sizedCatalog = structuredClone(catalog);
    sizedCatalog.items[0] = { ...sizedCatalog.items[0], sizes: [...sizedCatalog.items[0].sizes,
      { size: "LARGE", base_price_vnd: 20_000, base_liquid_ml: 200 }] };
    sizedCatalog.defaults.push({ size: "LARGE", powder_gram: "8", milk_ml: 200 });
    const result = quoteOrder(sizedCatalog, { items: [{ menu_item_id: "latte", size: "LARGE", quantity: 1,
      product_voucher_id: "discount", addon_option_ids: [{ option_id: "cream", quantity: 2 }] }] }, [
      { qr_token: "discount", voucher_type: "PRODUCT_DISCOUNT", product_discount_mode: "PAY_AS_SIZE", reference_size: "SMALL" },
    ]);
    expect(result).toMatchObject({ subtotal_vnd: 54_000, item_discount_vnd: 22_000, total_vnd: 32_000, surplusPoints: 0 });
  });
  it("PRODUCT_DISCOUNT FIXED_AMOUNT chỉ giảm một drink, không giảm addon hay sinh surplus", () => {
    const result = quoteOrder(catalog, { items: [{ menu_item_id: "latte", size: "SMALL", quantity: 1,
      product_voucher_id: "discount", addon_option_ids: [{ option_id: "cream", quantity: 2 }] }] }, [
      { qr_token: "discount", voucher_type: "PRODUCT_DISCOUNT", product_discount_mode: "FIXED_AMOUNT", discount_value: 50_000 },
    ]);
    expect(result).toMatchObject({ subtotal_vnd: 32_000, item_discount_vnd: 24_000, total_vnd: 8_000, surplusPoints: 0 });
  });
  it("Latte: 23.500 làm tròn 24.000, addon tách riêng 11.000", () => {
    const result = quoteLine(catalog, { menu_item_id: "latte", size: "SMALL", quantity: 1,
      addon_option_ids: [{ option_id: "cream", quantity: 2 }, { option_id: "matcha", quantity: 1 }] });
    expect(result).toMatchObject({ drink: 24_000, addons: 11_000, baseLiquidMl: 130, powderId: "powder-a", liquidId: "milk" });
  });
  it("Fusion swap bột và liquid: 12.000 + 12.000 + 3.000 + 3.600 thành 31.000", () => {
    const result = quoteLine(catalog, { menu_item_id: "fusion", size: "SMALL", quantity: 1,
      selected_powder_id: "powder-b", selected_base_liquid_id: "milk", addon_option_ids: [] });
    expect(result).toMatchObject({ drink: 31_000, addons: 0, powderId: "powder-b", liquidId: "milk", baseLiquidMl: 120 });
  });
  it("extras lấy nguyên giá merchandise 7.500, không chạy công thức đồ uống", () => {
    expect(quoteLine(catalog, { menu_item_id: "extra", quantity: 1 })).toMatchObject({ drink: 7_500, addons: 0, powderId: null, liquidId: null, baseLiquidMl: null });
  });
  it("stacking: PRODUCT/ADDON trước FIXED/PERCENT, ship không sinh cá", () => {
    const wallet = [
      { id: "p", qr_token: "product", voucher_type: "PRODUCT", menu_item_id: "latte", covered_price_vnd: 30_000 },
      { id: "a", qr_token: "addon", voucher_type: "ADDON", addon_option_id: "cream" },
      { id: "f", qr_token: "fixed", voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 10_000 },
      { id: "d", qr_token: "percent", voucher_type: "DISCOUNT", discount_type: "PERCENT", discount_value: 10 },
      { id: "s", qr_token: "ship", voucher_type: "FREESHIP", covered_delivery_fee_vnd: 10_000 },
    ];
    const result = quoteOrder(catalog, { order_type: "DELIVERY", shipping_fee_vnd: 13_000,
      discount_voucher_ids: ["percent", "fixed"], freeship_voucher_id: "ship", items: [
        { menu_item_id: "latte", size: "SMALL", quantity: 1, product_voucher_id: "product",
          addon_option_ids: [{ option_id: "cream", quantity: 2 }], addon_voucher_ids: [{ voucher_id: "addon", addon_option_id: "cream" }] },
        { menu_item_id: "latte", size: "SMALL", quantity: 4, addon_option_ids: [] },
      ] }, wallet);
    expect(result).toMatchObject({ subtotal_vnd: 128_000, item_discount_vnd: 28_000,
      total_voucher_discount_vnd: 19_000, total_vnd: 81_000, shipping_fee_vnd: 13_000,
      freeship_discount_vnd: 10_000, grand_total_vnd: 84_000, orderPoints: 8, surplusPoints: 0 });
  });
});
