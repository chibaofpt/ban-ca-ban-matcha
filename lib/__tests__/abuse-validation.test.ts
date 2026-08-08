import { describe, expect, it } from "vitest";

import { getOrderValueViolation } from "@/lib/orderLimits";
import {
  autocompleteQuerySchema,
  geocodeQuerySchema,
  locationQuerySchema,
} from "@/lib/validations/delivery";
import { customerOrderSchema, staffOrderSchema } from "@/lib/validations/order";

const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";

function item(quantity: number) {
  return {
    menu_item_id: ITEM_ID,
    quantity,
    size: "MEDIUM",
    client_price_vnd: 50_000,
  };
}

describe("Giới hạn cấu trúc đơn hàng", () => {
  it("khách chỉ được gửi tối đa 20 dòng, 20 ly và 10 ly mỗi dòng", () => {
    expect(customerOrderSchema.safeParse({ items: Array.from({ length: 20 }, () => item(1)) }).success).toBe(true);
    expect(customerOrderSchema.safeParse({ items: Array.from({ length: 21 }, () => item(1)) }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [item(11)] }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [item(10), item(10), item(1)] }).success).toBe(false);
  });

  it("nhân viên chỉ được gửi tối đa 50 dòng, 100 ly và 50 ly mỗi dòng", () => {
    expect(staffOrderSchema.safeParse({ items: Array.from({ length: 50 }, () => item(2)) }).success).toBe(true);
    expect(staffOrderSchema.safeParse({ items: Array.from({ length: 51 }, () => item(1)) }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [item(51)] }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [item(50), item(50), item(1)] }).success).toBe(false);
  });

  it("không làm yếu các trường chung bắt buộc của item", () => {
    expect(customerOrderSchema.safeParse({ items: [{ quantity: 1 }] }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [{ quantity: 1 }] }).success).toBe(false);
  });

  it("không nhận tọa độ giao hàng vô hạn hoặc ngoài phạm vi", () => {
    expect(customerOrderSchema.safeParse({ items: [item(1)], delivery_lat: 91 }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [item(1)], delivery_lng: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("chỉ nhận thông tin người nhận override đã được giới hạn và đúng định dạng", () => {
    expect(customerOrderSchema.safeParse({
      items: [item(1)],
      delivery_receiver_name: "Người Nhận",
      delivery_receiver_phone: "+84901234567",
    }).success).toBe(true);
    expect(customerOrderSchema.safeParse({
      items: [item(1)],
      delivery_receiver_name: " ".repeat(101),
    }).success).toBe(false);
    expect(customerOrderSchema.safeParse({
      items: [item(1)],
      delivery_receiver_phone: "+84|01234567",
    }).success).toBe(false);
  });

  it("chặn mảng addon, số lượng addon và voucher lồng nhau quá lớn", () => {
    const addon = { option_id: ITEM_ID, quantity: 1 };
    const addonVoucher = { voucher_id: ITEM_ID, addon_option_id: ITEM_ID };
    expect(customerOrderSchema.safeParse({ items: [{ ...item(1), addon_option_ids: Array(21).fill(addon) }] }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [{ ...item(1), addon_option_ids: [{ ...addon, quantity: 11 }] }] }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [{ ...item(1), addon_voucher_ids: Array(11).fill(addonVoucher) }] }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [{ ...item(1), addon_option_ids: Array(51).fill(addon) }] }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [{ ...item(1), addon_option_ids: [{ ...addon, quantity: 51 }] }] }).success).toBe(false);
    expect(staffOrderSchema.safeParse({ items: [{ ...item(1), addon_voucher_ids: Array(51).fill(addonVoucher) }] }).success).toBe(false);
    expect(customerOrderSchema.safeParse({ items: [item(1)], discount_voucher_ids: Array(11).fill(ITEM_ID) }).success).toBe(false);
  });
});

describe("Giới hạn giá trị đơn hàng", () => {
  it("cho phép đúng 20.000.000đ", () => {
    expect(getOrderValueViolation(20_000_000)).toBeNull();
  });

  it("trả đúng business reason khi tổng server vượt 20.000.000đ", () => {
    expect(getOrderValueViolation(20_000_001)).toEqual({
      error: "Order value exceeds the allowed maximum",
      code: "BUSINESS_RULE_VIOLATION",
      details: { reason: "ORDER_VALUE_EXCEEDED" },
    });
  });
});

describe("Validation query giao hàng", () => {
  it("autocomplete chỉ nhận q từ 2 đến 200 ký tự và session token hữu hạn", () => {
    expect(autocompleteQuerySchema.safeParse({ q: "ab", session_token: "s" }).success).toBe(true);
    expect(autocompleteQuerySchema.safeParse({ q: "a" }).success).toBe(false);
    expect(autocompleteQuerySchema.safeParse({ q: "a".repeat(201) }).success).toBe(false);
    expect(autocompleteQuerySchema.safeParse({ q: "ab", session_token: "s".repeat(201) }).success).toBe(false);
  });

  it("geocode chỉ nhận address từ 5 đến 500 ký tự", () => {
    expect(geocodeQuerySchema.safeParse({ address: "12345" }).success).toBe(true);
    expect(geocodeQuerySchema.safeParse({ address: "1234" }).success).toBe(false);
    expect(geocodeQuerySchema.safeParse({ address: "a".repeat(501) }).success).toBe(false);
  });

  it("estimate và reverse chỉ nhận tọa độ hữu hạn đúng phạm vi", () => {
    expect(locationQuerySchema.safeParse({ lat: "10.5", lng: "106.7" }).success).toBe(true);
    expect(locationQuerySchema.safeParse({ lat: "91", lng: "106" }).success).toBe(false);
    expect(locationQuerySchema.safeParse({ lat: "10", lng: "181" }).success).toBe(false);
    expect(locationQuerySchema.safeParse({ lat: "Infinity", lng: "106" }).success).toBe(false);
  });
});
