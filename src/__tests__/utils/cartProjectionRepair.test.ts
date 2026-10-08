import { describe, expect, it } from "vitest";

import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import { projectCart, resolveCartProjectionVouchers } from "@/src/lib/utils/cartProjection";
import type { MyVoucher } from "@/src/services/customerVoucherService";

const menuData: MenuData = {
  updated_at: "2026-09-11T00:00:00.000Z", latte_price_anchors: {},
  latte: [{
    id: "latte-1",
    name: "Matcha latte",
    description: null,
    category: "latte",
    is_seasonal: false,
    image_url: null,
    sort_order: 1,
    base_liquid_note: null,
    custom_powder_grams: null,
    powder: { id: "powder-1", name: "Matcha", type: "RECOMMEND" },
    default_powder_id: null, replacement_powder_id: null, resolved_default_powder_id: null,
    allowed_powder_ids: [],
    default_base_liquid_id: "milk-1",
    allowed_base_liquid_ids: ["milk-1"],
    sizes: [{ size: "MEDIUM", base_price_vnd: 50_000, milk_ml: 200 }],
  }],
  fusion: [],
  extras: [{
    id: "extra-1",
    name: "Bánh cá",
    description: null,
    category: "extras",
    is_seasonal: false,
    image_url: null,
    sort_order: 2,
    base_liquid_note: null,
    custom_powder_grams: null,
    powder: null,
    default_powder_id: null, replacement_powder_id: null, resolved_default_powder_id: null,
    allowed_powder_ids: [],
    default_base_liquid_id: null,
    allowed_base_liquid_ids: [],
    sizes: [],
    unit_price_vnd: 20_000,
  }],
  milk_types: [{ id: "milk-1", name: "Sữa tươi", price_per_ml: 1, is_default: true, display_order: 1 }],
  base_liquids: [{ id: "milk-1", name: "Sữa tươi", price_per_ml: 1, is_default: true, display_order: 1 }],
  addon_groups: [{
    id: "addon-group-1",
    name: "Topping",
    image_url: null,
    is_dynamic_gram: false,
    max_select: 1,
    sort_order: 1,
    options: [{
      id: "addon-1",
      label: "Kem",
      image_url: null,
      price_vnd: 10_000,
      gram_value: null,
      sort_order: 1,
    }],
  }],
};

const powderData: PowderApiResponse = {
  data: [{
    id: "powder-1",
    name: "Matcha",
    manufacturer: null,
    description: null,
    image_url: null,
    price_per_gram: 100,
    type: "RECOMMEND",
    fragrance: null,
    body: null,
    bitterness: null,
    umami: null,
    color: null,
    is_available: true,
    reference_latte_item_id: "latte-1",
    size_config: [],
  }],
  default_powder_gram: [{ size: "MEDIUM", grams: 4 }],
};

const cartItem: CartItem = {
  cartId: "line-1",
  menuItemId: "latte-1",
  quantity: 1,
  configuration: {
    size: "MEDIUM",
    sweetness: "FULL",
    iceOption: "NORMAL",
    coldwhisk: false,
    note: "",
    addonOptionIds: [],
  },
  addonVouchers: [],
};

function project(vouchers: ReturnType<typeof resolveCartProjectionVouchers>) {
  return projectCart({
    items: [cartItem],
    menuData,
    powderData,
    vouchers,
    selectedOrderVoucherTokens: [],
    bundleApplications: [],
    shippingFeeVnd: 0,
  });
}

function activeVoucher(patch: Partial<MyVoucher>): MyVoucher {
  return {
    qr_token: "voucher-token",
    voucher_type: "PRODUCT",
    discount_type: null,
    discount_value: null,
    menu_item_id: "legacy-anchor",
    size: "MEDIUM",
    matcha_powder_id: null,
    milk_type_id: null,
    included_addon_option_ids: [],
    addon_option_id: null,
    covered_price_vnd: 25_000,
    covered_delivery_fee_vnd: null,
    min_order_vnd: null,
    max_discount_vnd: null,
    status: "ACTIVE",
    used_channel: null,
    expires_at: null,
    redeemed_at: null,
    created_at: "2026-09-11T00:00:00.000Z",
    package: { name: "Voucher", description: null, points_cost: 0 },
    menuItem: null,
    addonOption: null,
    staff: null,
    availability: { status: "USABLE", can_apply: true, can_refund: false, refund_points: 0 },
    ...patch,
  };
}

describe("projection giỏ hàng theo trạng thái ví", () => {
  it("tính giá thật và không khóa checkout cho khách ẩn danh đã xác minh", () => {
    const result = project(resolveCartProjectionVouchers("anonymous", false, null));

    expect(result.checkoutBlocked).toBe(false);
    expect(result.revalidating).toBe(false);
    expect(result.lines[0]?.lineTotalVnd).toBeGreaterThan(0);
  });

  it("giữ placeholder và khóa checkout khi ví khách hàng chưa xác minh", () => {
    const result = project(resolveCartProjectionVouchers("authenticated", false, null));

    expect(result.checkoutBlocked).toBe(true);
    expect(result.revalidating).toBe(true);
    expect(result.lines[0]?.lineTotalVnd).toBe(0);
  });

  it("khóa checkout khi voucher món đã mất khỏi ví đã xác minh", () => {
    const result = projectCart({
      items: [{ ...cartItem, lineVoucher: { token: "missing", kind: "PRODUCT" } }],
      menuData,
      powderData,
      vouchers: [],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(true);
    expect(result.revalidating).toBe(false);
    expect(result.errors).toContain("Voucher món không còn hợp lệ");
  });

  it("ưu tiên PRODUCT target chuẩn hóa thay vì legacy anchor", () => {
    const voucher = activeVoucher({
      eligible_menu_items: [
        { menu_item_id: "legacy-anchor", name: "Món neo", category: "latte", is_available: true, is_seasonal: false, covered_price_vnd: 25_000 },
        { menu_item_id: "latte-1", name: "Matcha latte", category: "latte", is_available: true, is_seasonal: false, covered_price_vnd: 30_000 },
      ],
    });
    const result = projectCart({
      items: [{ ...cartItem, lineVoucher: { token: voucher.qr_token, kind: "PRODUCT" } }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(30_000);
    expect(result.lines[0]?.lineTotalVnd).toBe(21_000);
  });

  it("ưu tiên ITEM target chuẩn hóa thay vì legacy anchor", () => {
    const voucher = activeVoucher({
      voucher_type: "ITEM",
      eligible_menu_items: [
        { menu_item_id: "legacy-anchor", name: "Món neo", category: "extras", is_available: true, is_seasonal: false },
        { menu_item_id: "extra-1", name: "Bánh cá", category: "extras", is_available: true, is_seasonal: false },
      ],
    });
    const result = projectCart({
      items: [{
        cartId: "extra-line",
        menuItemId: "extra-1",
        quantity: 1,
        configuration: { size: null, note: "" },
        lineVoucher: { token: voucher.qr_token, kind: "ITEM" },
        addonVouchers: [],
      }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(20_000);
    expect(result.lines[0]?.lineTotalVnd).toBe(0);
  });

  it("ưu tiên ADDON target chuẩn hóa thay vì legacy anchor", () => {
    const voucher = activeVoucher({
      voucher_type: "ADDON",
      addon_option_id: "legacy-anchor",
      eligible_addon_options: [
        { addon_option_id: "legacy-anchor", label: "Topping neo", price_vnd: 5_000, is_active: true, is_dynamic_gram: false },
        { addon_option_id: "addon-1", label: "Kem", price_vnd: 10_000, is_active: true, is_dynamic_gram: false },
      ],
    });
    const result = projectCart({
      items: [{
        ...cartItem,
        configuration: {
          size: "MEDIUM",
          sweetness: "FULL",
          iceOption: "NORMAL",
          coldwhisk: false,
          note: "",
          addonOptionIds: ["addon-1"],
        },
        addonVouchers: [{ token: voucher.qr_token, addonOptionId: "addon-1" }],
      }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(10_000);
    expect(result.lines[0]?.lineTotalVnd).toBe(51_000);
  });

  it("giữ fallback legacy cho PRODUCT voucher chưa có normalized scope", () => {
    const voucher = activeVoucher({ menu_item_id: "latte-1" });
    const result = projectCart({
      items: [{ ...cartItem, lineVoucher: { token: voucher.qr_token, kind: "PRODUCT" } }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(25_000);
  });

  it("giữ fallback legacy cho ADDON voucher chưa có normalized scope", () => {
    const voucher = activeVoucher({ voucher_type: "ADDON", addon_option_id: "addon-1" });
    const result = projectCart({
      items: [{
        ...cartItem,
        configuration: {
          size: "MEDIUM",
          sweetness: "FULL",
          iceOption: "NORMAL",
          coldwhisk: false,
          note: "",
          addonOptionIds: ["addon-1"],
        },
        addonVouchers: [{ token: voucher.qr_token, addonOptionId: "addon-1" }],
      }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(10_000);
  });

  it("gỡ hiệu lực PRODUCT_DISCOUNT khi cart line đổi sang Base Liquid khác", () => {
    const voucher = activeVoucher({
      voucher_type: "PRODUCT_DISCOUNT",
      product_discount_mode: "FIXED_AMOUNT",
      discount_value: 10_000,
      menu_item_id: "latte-1",
      milk_type_id: "milk-1",
      eligible_sizes: ["MEDIUM"],
      eligible_menu_items: [{
        menu_item_id: "latte-1",
        name: "Matcha latte",
        category: "latte",
        is_available: true,
        is_seasonal: false,
        milk_type_id: "milk-1",
      }],
    });
    const alternateMilk = { id: "milk-2", name: "Sữa yến mạch", price_per_ml: 2, is_default: false, display_order: 2 };
    const menuWithAlternateMilk: MenuData = {
      ...menuData,
      latte: menuData.latte.map((item) => ({
        ...item,
        allowed_base_liquid_ids: ["milk-1", "milk-2"],
      })),
      milk_types: [...menuData.milk_types, alternateMilk],
      base_liquids: [...(menuData.base_liquids ?? []), alternateMilk],
    };
    const result = projectCart({
      items: [{
        ...cartItem,
        configuration: {
          size: "MEDIUM",
          sweetness: "FULL",
          iceOption: "NORMAL",
          coldwhisk: false,
          note: "",
          baseLiquidId: "milk-2",
          addonOptionIds: [],
        },
        lineVoucher: { token: voucher.qr_token, kind: "PRODUCT_DISCOUNT" },
      }],
      menuData: menuWithAlternateMilk,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(true);
    expect(result.errors).toContain("Voucher món không còn hợp lệ");
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(0);
  });

  it("coi Base Liquid mặc định là cấu hình hiệu lực khi cart legacy chưa lưu ID", () => {
    const voucher = activeVoucher({
      voucher_type: "PRODUCT_DISCOUNT",
      product_discount_mode: "FIXED_AMOUNT",
      discount_value: 10_000,
      menu_item_id: "latte-1",
      milk_type_id: "milk-1",
      eligible_sizes: ["MEDIUM"],
      eligible_menu_items: [{
        menu_item_id: "latte-1",
        name: "Matcha latte",
        category: "latte",
        is_available: true,
        is_seasonal: false,
        milk_type_id: "milk-1",
      }],
    });
    const result = projectCart({
      items: [{
        ...cartItem,
        lineVoucher: { token: voucher.qr_token, kind: "PRODUCT_DISCOUNT" },
      }],
      menuData,
      powderData,
      vouchers: [voucher],
      selectedOrderVoucherTokens: [],
      bundleApplications: [],
      shippingFeeVnd: 0,
    });

    expect(result.checkoutBlocked).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]?.personalVoucherDiscountVnd).toBe(10_000);
  });
});

describe("giỏ Fusion giữ anchor gốc và lựa chọn đã có", () => {
  const originalId = "powder-a";
  const replacementId = "powder-b";
  const fusion: MenuData["fusion"][number] = {
    ...menuData.latte[0]!, id: "fusion-1", name: "Fusion", category: "fusion", powder: null,
    default_powder_id: originalId, replacement_powder_id: replacementId, resolved_default_powder_id: replacementId,
    allowed_powder_ids: [], default_base_liquid_id: null, allowed_base_liquid_ids: [],
    custom_powder_grams: { MEDIUM: 4.5 },
    sizes: [{ size: "MEDIUM", base_price_vnd: 23_000, milk_ml: 0 }],
  };
  const a = { ...powderData.data[0]!, id: originalId, name: "A", price_per_gram: 6000, reference_latte_item_id: "latte-a" };
  const b = { ...powderData.data[0]!, id: replacementId, name: "B", price_per_gram: 7000, reference_latte_item_id: "latte-b" };
  const anchors = { [originalId]: { MEDIUM: 5000 }, [replacementId]: { MEDIUM: 8000 } };
  const runFusion = (selectedId: string, item: typeof fusion, availablePowders: typeof powderData.data) => {
    const raw: CartItem = {
      ...cartItem, menuItemId: fusion.id,
      configuration: {
        size: "MEDIUM", powderId: selectedId, sweetness: "FULL", iceOption: "NORMAL",
        coldwhisk: false, note: "", addonOptionIds: [],
      },
    };
    const result = projectCart({
      items: [raw], menuData: { ...menuData, latte: [], fusion: [item], extras: [], latte_price_anchors: anchors },
      powderData: { ...powderData, data: availablePowders }, vouchers: [], selectedOrderVoucherTokens: [],
      bundleApplications: [], shippingFeeVnd: 0,
    });
    expect(raw.configuration).toMatchObject({ powderId: selectedId });
    expect(result.lines[0]?.configuration).toMatchObject({ powderId: selectedId });
    return result;
  };
  it("default thay thế B vẫn cộng premium B trừ A khi Latte A đã ẩn", () => {
    const result = runFusion(replacementId, fusion, [b]);
    // ceil(23,000 + 4.5 × 7,000 + (8,000 - 5,000)) = 58,000.
    expect(result.lines[0]?.drinkPriceVnd).toBe(58_000);
    expect(result.checkoutBlocked).toBe(false);
  });
  it("cart A bị ngưng bán giữ nguyên ID và yêu cầu chọn lại trước checkout", () => {
    const result = runFusion(originalId, fusion, [b]);
    expect(result.checkoutBlocked).toBe(true);
    expect(result.lines[0]?.errors.join(" ")).toMatch(/chọn lại/);
  });
  it("A mở lại giữ cart B khi B active và có trong allow-list lâu dài", () => {
    const result = runFusion(replacementId, { ...fusion, resolved_default_powder_id: originalId, allowed_powder_ids: [replacementId] }, [a, b]);
    expect(result.lines[0]?.drinkPriceVnd).toBe(58_000);
    expect(result.checkoutBlocked).toBe(false);
  });
  it("A mở lại khóa cart B nếu B chỉ là replacement tạm thời", () => {
    const result = runFusion(replacementId, { ...fusion, resolved_default_powder_id: originalId, allowed_powder_ids: [] }, [a, b]);
    expect(result.checkoutBlocked).toBe(true);
    expect(result.lines[0]?.errors.join(" ")).toMatch(/chọn lại/);
  });
  it("A mở lại vẫn khóa cart B đã inactive dù B nằm trong allow-list", () => {
    const result = runFusion(replacementId, { ...fusion, resolved_default_powder_id: originalId, allowed_powder_ids: [replacementId] }, [a]);
    expect(result.checkoutBlocked).toBe(true);
    expect(result.lines[0]?.errors.join(" ")).toMatch(/chọn lại/);
  });
});
