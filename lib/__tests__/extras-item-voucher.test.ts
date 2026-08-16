import { describe, expect, it } from "vitest";
import {
  calcOrderTotals,
  type CalcOrderInput,
  type CalcOrderItem,
  type CalcOrderResult,
} from "@/lib/orderCalculator";

const EXTRA_ITEM_ID = "extra-dessert-1";

type ItemVoucherCalcItem = Omit<
  CalcOrderItem,
  "product_voucher_id" | "product_voucher_covered_vnd"
> & {
  category: "extras";
  item_voucher_id: string | null;
  item_voucher_covered_vnd: number;
};

type ItemVoucherCalcInput = Omit<CalcOrderInput, "items"> & {
  items: ItemVoucherCalcItem[];
};

const calculateItemVoucher: (input: ItemVoucherCalcInput) => CalcOrderResult =
  calcOrderTotals;

function makeExtrasItem(
  overrides: Partial<ItemVoucherCalcItem> = {},
): ItemVoucherCalcItem {
  return {
    menu_item_id: EXTRA_ITEM_ID,
    category: "extras",
    unit_price_vnd: 26_000,
    addons_price_vnd: 0,
    quantity: 1,
    line_total: 26_000,
    item_voucher_id: "item-voucher-1",
    item_voucher_covered_vnd: 50_000,
    addon_vouchers: [],
    ...overrides,
  };
}

describe("ITEM voucher trên extras", () => {
  it("cover tối đa đúng giá hiện tại và không phát sinh surplus", () => {
    const result = calculateItemVoucher({
      items: [makeExtrasItem()],
      discountVouchers: [],
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });

    expect(result.subtotal_vnd).toBe(26_000);
    expect(result.itemResults[0]).toMatchObject({
      item_voucher_id: "item-voucher-1",
      item_voucher_discount_vnd: 26_000,
      total_discount_vnd: 26_000,
    });
    expect(result.order_surplus_vnd).toBe(0);
    expect(result.total_vnd).toBe(0);
    expect(result.appliedVoucherIds).toContain("item-voucher-1");
  });

  it("không cho ITEM voucher của extras tạo giảm giá âm hoặc cộng vào addon", () => {
    const result = calculateItemVoucher({
      items: [makeExtrasItem({
        addons_price_vnd: 8_000,
        line_total: 34_000,
      })],
      discountVouchers: [],
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });

    expect(result.itemResults[0]).toMatchObject({
      item_voucher_discount_vnd: 26_000,
      total_discount_vnd: 26_000,
    });
    expect(result.total_vnd).toBe(8_000);
    expect(result.order_surplus_vnd).toBe(0);
  });

  it("ITEM voucher trùng cùng QR trên hai line chỉ được áp dụng một lần", () => {
    const result = calculateItemVoucher({
      items: [
        makeExtrasItem({
          item_voucher_id: "item-voucher-duplicate",
          item_voucher_covered_vnd: 26_000,
        }),
        makeExtrasItem({
          item_voucher_id: "item-voucher-duplicate",
          item_voucher_covered_vnd: 26_000,
        }),
      ],
      discountVouchers: [],
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });

    expect(
      result.appliedVoucherIds.filter((id) => id === "item-voucher-duplicate"),
    ).toHaveLength(1);
    expect(result.skippedVoucherIds).toContain("item-voucher-duplicate");
    expect(result.total_vnd).toBe(26_000);
  });
});
