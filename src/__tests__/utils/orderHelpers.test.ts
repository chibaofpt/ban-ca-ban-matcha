import { describe, it, expect } from "vitest";
import { groupOrderItems } from "@/src/utils/orderHelpers";
import type { OrderItemRes } from "@/src/services/staffOrdersListService";

const baseItem: OrderItemRes = {
  menuItem: { name: "Latte Matcha", category: "latte" },
  quantity: 1,
  unit_price_vnd: 55000,
  addons_price_vnd: 0,
  size: "MEDIUM",
  sweetness: "FULL",
  ice_option: "NORMAL",
  coldwhisk: false,
  note: null,
  selectedPowder: null,
  milkType: { name: "Sữa bò", is_default: true },
  addons: [],
};

describe("groupOrderItems", () => {
  it("trả về mảng rỗng khi input rỗng", () => {
    expect(groupOrderItems([])).toEqual([]);
  });

  it("gộp 2 món giống hệt nhau và cộng dồn quantity", () => {
    const items: OrderItemRes[] = [
      { ...baseItem, quantity: 1 },
      { ...baseItem, quantity: 2 },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].quantity).toBe(3);
    expect(grouped[0].unit_price_vnd).toBe(55000);
  });

  it("giữ nguyên 2 dòng nếu khác độ ngọt hoặc đá", () => {
    const items: OrderItemRes[] = [
      { ...baseItem, sweetness: "FULL" },
      { ...baseItem, sweetness: "HALF" },
      { ...baseItem, ice_option: "LESS_ICE" },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(3);
  });

  it("giữ nguyên 2 dòng nếu khác note", () => {
    const items: OrderItemRes[] = [
      { ...baseItem, note: "Ít sữa" },
      { ...baseItem, note: null },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(2);
  });

  it("giữ nguyên 2 dòng nếu khác addons", () => {
    const items: OrderItemRes[] = [
      {
        ...baseItem,
        addons: [
          {
            unit_price_vnd: 10000,
            quantity: 1,
            addonOption: {
              label: "1 viên kem",
              gram_value: null,
              price_vnd: 10000,
              group: { name: "Kem" },
            },
          },
        ],
      },
      { ...baseItem, addons: [] },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(2);
  });

  it("không gộp hai menu item khác ID dù có cùng tên và cấu hình", () => {
    const grouped = groupOrderItems([
      { ...baseItem, menu_item_id: "item-a" },
      { ...baseItem, menu_item_id: "item-b" },
    ]);

    expect(grouped).toHaveLength(2);
  });

  it("gộp 2 món giống hệt cấu hình khi 1 món có productVoucher và 1 món không", () => {
    const items: OrderItemRes[] = [
      {
        ...baseItem,
        quantity: 1,
        productVoucher: { package: { name: "Free Latte M" } },
        product_voucher_discount_vnd: 55000,
      },
      { ...baseItem, quantity: 2 },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].quantity).toBe(3);
    expect(grouped[0].productVoucher).toEqual({ package: { name: "Free Latte M" } });
    expect(grouped[0].product_voucher_discount_vnd).toBe(55000);
  });

  it("gộp danh sách addonVouchers của các món bị gộp", () => {
    const items: OrderItemRes[] = [
      {
        ...baseItem,
        quantity: 1,
        addonVouchers: [
          { discount_applied_vnd: 10000, voucher: { package: { name: "Free Kem" } } },
        ],
      },
      {
        ...baseItem,
        quantity: 1,
        addonVouchers: [
          { discount_applied_vnd: 10000, voucher: { package: { name: "Free Đá dừa" } } },
        ],
      },
    ];
    const grouped = groupOrderItems(items);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].quantity).toBe(2);
    expect(grouped[0].addonVouchers).toHaveLength(2);
  });
});
