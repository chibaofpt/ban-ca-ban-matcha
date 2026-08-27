import { describe, expect, it } from "vitest";
import { productVoucherTargetsMenuItem, type ProductVoucherInfo } from "@/lib/orders";

const base: ProductVoucherInfo = {
  menu_item_id: "anchor",
  eligible_menu_item_ids: ["anchor", "second"],
  covered_price_vnd: 0,
  voucher_type: "PRODUCT_DISCOUNT",
  product_discount_mode: "FIXED_AMOUNT",
  eligible_sizes: ["MEDIUM"],
  discount_value: 10_000,
};

describe("Scope server PRODUCT_DISCOUNT nhiều món", () => {
  it("khớp món non-anchor trong snapshot chuẩn hóa", () => {
    expect(productVoucherTargetsMenuItem(base, "second")).toBe(true);
  });

  it("từ chối món ngoài scope", () => {
    expect(productVoucherTargetsMenuItem(base, "outside")).toBe(false);
  });

  it("fallback anchor cho voucher legacy", () => {
    expect(productVoucherTargetsMenuItem({ ...base, eligible_menu_item_ids: undefined }, "anchor")).toBe(true);
  });
});
