import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAddItem, mockApplyProductVoucher, mockFetchMenu, powderState } = vi.hoisted(() => ({
  mockAddItem: vi.fn(() => "new-cart-line"),
  mockApplyProductVoucher: vi.fn(),
  mockFetchMenu: vi.fn(),
  powderState: {
    data: [{ id: "powder-1", price_per_gram: 2_000, size_config: [] }],
    defaultPowderGram: [{ size: "MEDIUM", grams: 4 }],
  },
}));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: () => ({
    addItem: mockAddItem,
    applyProductVoucher: mockApplyProductVoucher,
    setCartOpen: vi.fn(),
  }),
}));

vi.mock("@/src/lib/store/powderStore", () => ({
  usePowderStore: (selector: (state: typeof powderState) => unknown) => selector(powderState),
}));

vi.mock("@/src/services/menuService", () => ({
  fetchMenu: () => mockFetchMenu(),
}));

import {
  computeVoucherItemPrice,
  computeProductDiscountBenefit,
  resolveVoucherBaseLiquidId,
  useAddVoucherToCart,
} from "@/src/hooks/useAddVoucherToCart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";

const liquids: MilkTypeOption[] = [
  { id: "orange", name: "Nước cam", price_per_ml: 25, is_default: true, display_order: 0 },
  { id: "oat", name: "Sữa yến mạch", price_per_ml: 60, is_default: false, display_order: 1 },
];

const fusion = {
  id: "fusion-1",
  name: "Fusion cam",
  category: "fusion",
  default_base_liquid_id: "orange",
  allowed_base_liquid_ids: ["oat"],
  resolved_default_powder_id: "powder-1",
  custom_powder_grams: null,
  sizes: [{ size: "SMALL", base_price_vnd: 20_000, milk_ml: 200, base_liquid_ml: 200 }],
} as unknown as MenuItem;

describe("PRODUCT voucher add-to-cart Base Liquid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tính benefit PRODUCT_DISCOUNT không bao gồm addon", () => {
    expect(computeProductDiscountBenefit({ product_discount_mode: "FIXED_AMOUNT", discount_value: 50_000 }, 40_000, null)).toBe(40_000);
    expect(computeProductDiscountBenefit({ product_discount_mode: "PAY_AS_SIZE", discount_value: null }, 72_000, 53_000)).toBe(19_000);
    expect(computeProductDiscountBenefit({ product_discount_mode: "PAY_AS_SIZE", discount_value: null }, 52_000, 53_000)).toBe(0);
  });
  it("tính delta Base Liquid cho Fusion giống luồng order", () => {
    const result = computeVoucherItemPrice(
      fusion,
      "SMALL",
      "powder-1",
      "oat",
      [],
      [{ id: "powder-1", price_per_gram: 2_000, size_config: [] }] as never,
      [{ size: "SMALL", grams: 5 }] as never,
      [],
      liquids,
      [],
    );

    expect(result.drinkPrice).toBe(37_000);
  });

  it("chỉ đưa lựa chọn còn thuộc allow-list vào cart", () => {
    expect(resolveVoucherBaseLiquidId(fusion, "oat", liquids)).toBe("oat");
    expect(resolveVoucherBaseLiquidId(fusion, "removed", liquids)).toBe("orange");
  });

  it("áp PRODUCT_DISCOUNT nhiều món bằng target đã chọn dù menu_item_id để trống", async () => {
    const latte = {
      id: "latte-1",
      name: "Latte",
      category: "latte",
      image_url: null,
      powder: { id: "powder-1" },
      custom_powder_grams: null,
      sizes: [{ size: "MEDIUM", base_price_vnd: 30_000, milk_ml: 200 }],
    } as unknown as MenuItem;
    mockFetchMenu.mockResolvedValue({
      latte: [latte],
      fusion: [],
      extras: [],
      milk_types: [{ id: "milk", name: "Sữa", price_per_ml: 40, is_default: true, display_order: 0 }],
      base_liquids: [],
      addon_groups: [],
    });
    const voucher = {
      voucher_type: "PRODUCT_DISCOUNT",
      qr_token: "product-discount-token",
      menu_item_id: null,
      eligible_menu_items: [{ menu_item_id: "latte-1" }],
      eligible_sizes: ["MEDIUM"],
      product_discount_mode: "FIXED_AMOUNT",
      discount_value: 10_000,
      matcha_powder_id: null,
      milk_type_id: null,
      included_addon_option_ids: [],
    } as unknown as MyVoucher;
    const { result } = renderHook(() => useAddVoucherToCart());

    let response: Awaited<ReturnType<typeof result.current.addToCart>> | undefined;
    await act(async () => {
      response = await result.current.addToCart(voucher, { menuItemId: "latte-1", size: "MEDIUM" });
    });

    expect(response).toEqual({ ok: true });
    expect(mockApplyProductVoucher).toHaveBeenCalledWith(
      "new-cart-line",
      voucher.qr_token,
      10_000,
      "PRODUCT_DISCOUNT",
    );
  });
});
