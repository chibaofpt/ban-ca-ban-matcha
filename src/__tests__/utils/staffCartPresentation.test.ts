import { describe, expect, it } from "vitest";
import { calcOrderTotals } from "@/src/utils/orderCalculator";
import { getStaffCartSummaryRows, resolveStaffCartDisplayProjection } from "@/src/lib/utils/staffCartPresentation";
import { projectCart, type CartProjectionInput } from "@/src/lib/utils/cartProjection";
import type { MyVoucher } from "@/src/services/customerVoucherService";

describe("bảng tiền cart staff/admin", () => {
  it("gộp BUNDLE, PRODUCT, PRODUCT_DISCOUNT và ITEM vào món, tách ADDON và giảm toàn đơn", () => {
    const totals = calcOrderTotals({
      items: [
        { menu_item_id: "bundle", unit_price_vnd: 20_000, addons_price_vnd: 5_000, quantity: 1, line_total: 25_000, bundle_discount_vnd: 5_000, addon_vouchers: [] },
        { menu_item_id: "product", unit_price_vnd: 40_000, addons_price_vnd: 4_000, quantity: 1, line_total: 44_000, product_voucher_id: "product-token", product_voucher_covered_vnd: 35_000,
          addon_vouchers: [{ voucher_id: "addon-token", addon_option_id: "cream", covered_price_vnd: 4_000, unit_price_vnd: 4_000 }] },
        { menu_item_id: "extras", category: "extras", unit_price_vnd: 20_000, addons_price_vnd: 0, quantity: 1, line_total: 20_000, item_voucher_id: "item-token", addon_vouchers: [] },
        { menu_item_id: "product-discount", unit_price_vnd: 25_000, addons_price_vnd: 0, quantity: 1, line_total: 25_000, product_voucher_id: "discount-token", product_voucher_discount_vnd: 10_000, addon_vouchers: [] },
      ],
      discountVouchers: [{ id: "order-token", discount_type: "FIXED", discount_value: 10_000, min_order_vnd: null, max_discount_vnd: null }],
      freeshipVoucher: { id: "ship-token", covered_delivery_fee_vnd: 5_000, min_order_vnd: null },
      shipping_fee_vnd: 15_000,
    });
    expect(getStaffCartSummaryRows(totals)).toEqual([
      { label: "Tổng tiền", amountVnd: 114_000, discount: false },
      { label: "Giảm giá món", amountVnd: 70_000, discount: true },
      { label: "Giảm giá topping", amountVnd: 4_000, discount: true },
      { label: "Tiền ship", amountVnd: 15_000, discount: false },
      { label: "Giảm tiền ship", amountVnd: 5_000, discount: true },
      { label: "Giảm toàn đơn", amountVnd: 10_000, discount: true },
      { label: "Thanh toán", amountVnd: 40_000, discount: false },
    ]);
  });

  it("ẩn các khoản bằng 0 nhưng luôn giữ Thanh toán", () => {
    const totals = calcOrderTotals({ items: [], discountVouchers: [], freeshipVoucher: null, shipping_fee_vnd: 0 });
    expect(getStaffCartSummaryRows(totals)).toEqual([
      { label: "Thanh toán", amountVnd: 0, discount: false },
    ]);
  });
});

const cachedInput: CartProjectionInput = {
  items: [{ cartId: "extra-line", menuItemId: "extra", quantity: 1, configuration: { size: null, note: "" }, addonVouchers: [] }],
  menuData: {
    updated_at: "2026-10-02T00:00:00Z", latte: [], fusion: [], milk_types: [], addon_groups: [],
    extras: [{
      id: "extra", name: "Bánh cá", description: null, category: "extras", is_seasonal: false,
      image_url: null, sort_order: 1, base_liquid_note: null, custom_powder_grams: null,
      powder: null, resolved_default_powder_id: null, allowed_powder_ids: [],
      default_base_liquid_id: null, allowed_base_liquid_ids: [], sizes: [], unit_price_vnd: 20_000,
    }],
  },
  powderData: { data: [], default_powder_gram: [] },
  vouchers: [], selectedOrderVoucherTokens: [], bundleApplications: [], shippingFeeVnd: 0,
};

describe("display projection cart staff/admin khi tải nền", () => {

  it("giữ giảm voucher món từ cache trong khi verification vẫn chờ ví hiện hành", () => {
    const voucher: MyVoucher = {
      qr_token: "item-token", voucher_type: "ITEM", discount_type: null, discount_value: null,
      menu_item_id: "extra", size: null, matcha_powder_id: null, milk_type_id: null,
      included_addon_option_ids: [], addon_option_id: null, covered_price_vnd: null,
      covered_delivery_fee_vnd: null, min_order_vnd: null, max_discount_vnd: null,
      status: "ACTIVE", used_channel: null, expires_at: null, redeemed_at: null,
      created_at: "2026-10-02T00:00:00Z", package: { name: "Bánh cá", description: null, points_cost: 0 },
      menuItem: null, addonOption: null, staff: null,
      availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
    };
    const input = { ...cachedInput, vouchers: [voucher], items: cachedInput.items.map((item) => ({
      ...item, lineVoucher: { token: "item-token", kind: "ITEM" as const },
    })) };
    const verified = projectCart({ ...input, vouchers: null });
    const display = resolveStaffCartDisplayProjection(verified, input);
    expect(display.lines[0]).toMatchObject({ name: "Bánh cá", personalVoucherDiscountVnd: 20_000, lineTotalVnd: 0, errors: [] });
    expect(display.totals).toMatchObject({ subtotal_vnd: 20_000, item_discount_vnd: 20_000, grand_total_vnd: 0 });
    expect(verified.checkoutBlocked).toBe(true);
  });

  it("giữ tên và giá từ catalog/ví đã có, không thay đổi verification đang khóa checkout", () => {
    const verified = projectCart({ ...cachedInput, vouchers: null });
    const display = resolveStaffCartDisplayProjection(verified, cachedInput);
    expect(display.lines[0]).toMatchObject({ name: "Bánh cá", lineTotalVnd: 20_000, revalidating: false });
    expect(display.totals.grand_total_vnd).toBe(20_000);
    expect(verified).toMatchObject({ checkoutBlocked: true, revalidating: true });
    expect(verified.lines[0].lineTotalVnd).toBe(0);
  });

  it("không dùng dữ liệu ví khi owner hiện tại chưa có cache", () => {
    const verified = projectCart({ ...cachedInput, vouchers: null });
    expect(resolveStaffCartDisplayProjection(verified, { ...cachedInput, vouchers: null })).toBe(verified);
  });

  it("hiển thị số lượng vừa sửa trong lúc refetch thay vì giữ snapshot cart cũ", () => {
    const changed = { ...cachedInput, items: cachedInput.items.map((item) => ({ ...item, quantity: 2 })) };
    const verified = projectCart({ ...changed, vouchers: null });
    expect(resolveStaffCartDisplayProjection(verified, changed).lines[0].lineTotalVnd).toBe(40_000);
    expect(verified.checkoutBlocked).toBe(true);
  });

  it("dùng kết quả mới sau xác minh, gồm giá đã đổi hoặc voucher không còn hợp lệ", () => {
    const changed = { ...cachedInput, items: cachedInput.items.map((item) => ({
      ...item, lineVoucher: { token: "expired-item", kind: "ITEM" as const },
    })) };
    const verified = projectCart(changed);
    const display = resolveStaffCartDisplayProjection(verified, cachedInput);
    expect(display).toBe(verified);
    expect(display.lines[0].errors).toContain("Voucher món không còn hợp lệ");
    expect(display.checkoutBlocked).toBe(true);
  });
});
