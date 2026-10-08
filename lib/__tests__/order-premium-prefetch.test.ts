import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { processOrderItems } from "@/lib/orders/orderProcessing";
import type { OrderItemInput } from "@/lib/orders/orderProcessingTypes";
import type { ProductVoucherInfo } from "@/lib/orders/orderVoucherTargets";

function catalog(options: { selectedMedium?: number | null; reference?: string | null; inactiveDefault?: boolean } = {}) {
  const powders = [
    { id: "default", name: "Default", price_per_gram: 4_000, is_available: !options.inactiveDefault, reference_latte_item_id: "latte-default" },
    { id: "selected", name: "Selected", price_per_gram: 6_000, is_available: true,
      reference_latte_item_id: options.reference === undefined ? "latte-selected" : options.reference },
  ];
  const sizes = [
    { menu_item_id: "latte-default", size: "SMALL", base_price_vnd: 13_000 },
    { menu_item_id: "latte-default", size: "MEDIUM", base_price_vnd: 20_000 },
    { menu_item_id: "latte-selected", size: "SMALL", base_price_vnd: 18_000 },
    { menu_item_id: "latte-selected", size: "MEDIUM", base_price_vnd: options.selectedMedium === undefined ? 27_000 : options.selectedMedium },
  ];
  return {
    defaultSizeConfig: { findMany: vi.fn().mockResolvedValue([
      { size: "SMALL", milk_ml: 130, powder_gram: 3 },
      { size: "MEDIUM", milk_ml: 200, powder_gram: 4 },
    ]) },
    powderSizeConfig: { findMany: vi.fn().mockResolvedValue([]) },
    matchaPowder: {
      findMany: vi.fn().mockResolvedValue(powders),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => powders.find((powder) => powder.id === where.id) ?? null),
    },
    milkType: { findMany: vi.fn().mockResolvedValue([
      { id: "milk", is_default: true, is_active: true, price_per_ml: 40, display_order: 0 },
    ]) },
    menuItemSize: {
      findMany: vi.fn().mockResolvedValue(sizes),
      findFirst: vi.fn(async ({ where }: { where: { menu_item_id: string; size: string } }) =>
        sizes.find((row) => row.menu_item_id === where.menu_item_id && row.size === where.size) ?? null),
    },
    menuItem: { findMany: vi.fn().mockResolvedValue([{
      id: "fusion", name: "Fusion", category: "fusion", is_available: true,
      default_powder_id: "default", replacement_powder_id: options.inactiveDefault ? "selected" : null, default_base_liquid_id: "milk", custom_powder_grams: null,
      sizes: [{ size: "SMALL", base_price_vnd: 15_000 }, { size: "MEDIUM", base_price_vnd: 20_000 }],
      fusionAllowedPowders: [{ powder_id: "selected", matchaPowder: { is_available: true } }],
      allowedBaseLiquids: [],
    }]) },
    addonOption: { findMany: vi.fn().mockResolvedValue([{
      id: "topping", price_vnd: 7_000, gram_value: null, is_active: true,
      group: { id: "group", is_active: true, max_select: 1, is_dynamic_gram: false },
    }]) },
  };
}

const voucher: ProductVoucherInfo = {
  menu_item_id: "fusion", covered_price_vnd: 0, voucher_type: "PRODUCT_DISCOUNT",
  product_discount_mode: "PAY_AS_SIZE", eligible_sizes: ["MEDIUM"], reference_size: "SMALL",
};

function line(clientPrice: number, productVoucher?: string): OrderItemInput {
  return { menu_item_id: "fusion", quantity: 1, size: "MEDIUM", sweetness: "FULL",
    selected_powder_id: "selected", addon_option_ids: ["topping"],
    client_price_vnd: clientPrice, product_voucher_id: productVoucher };
}

describe("Fusion dùng pricing thật và snapshot catalog của order", () => {
  it("giữ giá đổi bột và PAY_AS_SIZE, không giảm tiền topping", async () => {
    const db = catalog();
    const result = await processOrderItems([line(58_000), line(45_000, "voucher")],
      db as unknown as Parameters<typeof processOrderItems>[1], new Map([["voucher", voucher]]));
    // M: 20k + 4g × 6k + (27k - 20k) = 51k. S: 15k + 3g × 6k + (18k - 13k) = 38k.
    expect(result.map((item) => ({ price: item.unit_price_vnd, discount: item.product_voucher_discount_vnd, addons: item.addons_price_vnd })))
      .toEqual([{ price: 51_000, discount: 0, addons: 7_000 }, { price: 51_000, discount: 13_000, addons: 7_000 }]);
    // Query-budget requirement: the item loop must use the catalog already loaded by this order.
    expect(db.matchaPowder.findUnique).not.toHaveBeenCalled();
    expect(db.menuItemSize.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { name: "phụ phí âm", options: { selectedMedium: 15_000 }, price: 39_000, discount: 1_000, payable: 45_000 },
    { name: "thiếu reference Latte", options: { reference: null }, price: 44_000, discount: 11_000, payable: 40_000 },
    { name: "giá size tham chiếu null", options: { selectedMedium: null }, price: 24_000, discount: 0, payable: 31_000 },
  ])("giữ fallback khi $name", async ({ options, price, discount, payable }) => {
    const db = catalog(options);
    const [result] = await processOrderItems([line(payable, "voucher")],
      db as unknown as Parameters<typeof processOrderItems>[1], new Map([["voucher", voucher]]));
    expect(result).toMatchObject({ unit_price_vnd: price, product_voucher_discount_vnd: discount, addons_price_vnd: 7_000 });
  });

  it("giữ mốc gốc inactive khi bột thay thế là mặc định hiện tại", async () => {
    const db = catalog();
    db.matchaPowder.findMany.mockResolvedValue([
      { id: "default", name: "A", price_per_gram: 6_000, is_available: false, reference_latte_item_id: "latte-default" },
      { id: "selected", name: "B", price_per_gram: 7_000, is_available: true, reference_latte_item_id: "latte-selected" },
    ]);
    db.menuItem.findMany.mockResolvedValue([{
      id: "fusion", name: "Fusion", category: "fusion", is_available: true,
      default_powder_id: "default", replacement_powder_id: "selected", default_base_liquid_id: "milk", custom_powder_grams: null,
      sizes: [{ size: "SMALL", base_price_vnd: 23_000 }, { size: "MEDIUM", base_price_vnd: 23_000 }],
      fusionAllowedPowders: [], allowedBaseLiquids: [],
    }]);
    db.defaultSizeConfig.findMany.mockResolvedValue([
      { size: "MEDIUM", milk_ml: 200, powder_gram: 4.5 },
    ]);
    db.menuItemSize.findMany.mockResolvedValue([
      { menu_item_id: "latte-default", size: "MEDIUM", base_price_vnd: 5_000 },
      { menu_item_id: "latte-selected", size: "MEDIUM", base_price_vnd: 8_000 },
    ]);
    const input = { ...line(58_000), addon_option_ids: [] };
    const [result] = await processOrderItems([input], db as unknown as Parameters<typeof processOrderItems>[1]);
    expect(result).toMatchObject({ selected_powder_id: "selected", unit_price_vnd: 58_000 });
    expect(db.matchaPowder.findMany).toHaveBeenCalledWith({
      where: { OR: [{ is_available: true }, { id: { in: ["default"] } }] },
    });
    expect(db.matchaPowder.findUnique).not.toHaveBeenCalled();
    expect(db.menuItemSize.findFirst).not.toHaveBeenCalled();
    await expect(processOrderItems([{ ...input, client_price_vnd: 50_000 }],
      db as unknown as Parameters<typeof processOrderItems>[1])).rejects.toMatchObject({
        conflicts: [{ menu_item_id: "fusion", server_price_vnd: 58_000, client_price_vnd: 50_000 }],
      });
  });

  it("PAY_AS_SIZE trên replacement giữ mốc original cho cả size tính tiền và size tham chiếu", async () => {
    const db = catalog({ inactiveDefault: true });
    const [result] = await processOrderItems([line(45_000, "voucher")],
      db as unknown as Parameters<typeof processOrderItems>[1], new Map([["voucher", voucher]]));
    // M51k and S38k: discount13k; addon7k stays payable. Replacement remains the current selection.
    expect(result).toMatchObject({
      selected_powder_id: "selected", unit_price_vnd: 51_000,
      product_voucher_discount_vnd: 13_000, addons_price_vnd: 7_000,
    });
  });
});
