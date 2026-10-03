import { describe, expect, it } from "vitest";
import {
  productVoucherTargetsConfiguration,
  productVoucherTargetsMenuItem,
  type ProductVoucherInfo,
} from "@/lib/orders/orderVoucherTargets";

const base: ProductVoucherInfo = {
  menu_item_id: "anchor",
  eligible_menu_item_ids: ["anchor", "second"],
  covered_price_vnd: 0,
  voucher_type: "PRODUCT_DISCOUNT",
  product_discount_mode: "FIXED_AMOUNT",
  eligible_sizes: ["MEDIUM"],
  discount_value: 10_000,
  milk_type_id: "cow-milk",
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

  it("chỉ khớp cấu hình có đúng Base Liquid đã khóa", () => {
    expect(productVoucherTargetsConfiguration(base, "anchor", "cow-milk")).toBe(true);
    expect(productVoucherTargetsConfiguration(base, "anchor", "oat-milk")).toBe(false);
  });

  it("voucher cũ không khóa Base Liquid vẫn khớp cấu hình hiện tại", () => {
    expect(productVoucherTargetsConfiguration({ ...base, milk_type_id: null }, "anchor", "oat-milk")).toBe(true);
  });

  it("PRODUCT chỉ dùng snapshot Base Liquid làm cấu hình ban đầu, không khóa tùy biến", () => {
    expect(productVoucherTargetsConfiguration({ ...base, voucher_type: "PRODUCT" }, "anchor", "oat-milk")).toBe(true);
  });
});
