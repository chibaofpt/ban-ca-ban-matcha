import { describe, expect, it } from "vitest";
import { calcOrderTotals } from "@/lib/orderCalculator";

describe("thứ tự tính giá BUNDLE → PRODUCT → ADDON → DISCOUNT", () => {
  it("trừ quà BUNDLE trước khi áp dụng DISCOUNT cho phần còn lại", () => {
    const result = calcOrderTotals({
      items: [
        {
          menu_item_id: "matcha",
          unit_price_vnd: 45_000,
          addons_price_vnd: 0,
          quantity: 2,
          line_total: 90_000,
          bundle_discount_vnd: 45_000,
          product_voucher_id: null,
          product_voucher_covered_vnd: 0,
          addon_vouchers: [],
        },
      ],
      discountVouchers: [
        { id: "discount", discount_type: "PERCENT", discount_value: 10, min_order_vnd: null },
      ],
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });

    expect(result.itemResults[0]?.bundle_discount_vnd).toBe(45_000);
    expect(result.items_discount_vnd).toBe(45_000);
    expect(result.discountable_subtotal_vnd).toBe(45_000);
    expect(result.total_voucher_discount_vnd).toBe(4_000);
    expect(result.total_vnd).toBe(41_000);
  });
});
