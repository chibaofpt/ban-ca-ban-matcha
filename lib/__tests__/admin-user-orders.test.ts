import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userFindFirst: vi.fn(), orderFindFirst: vi.fn(), voucherFindMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: mocks.userFindFirst },
  order: { findFirst: mocks.orderFindFirst, findMany: vi.fn(), count: vi.fn() },
  voucher: { findMany: mocks.voucherFindMany },
} }));

import { getAdminUserOrder } from "@/lib/adminUserQueries";

describe("Admin customer order policy", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.userFindFirst.mockResolvedValue({ id: "customer-id" }); });

  it("constrains detail by order and CUSTOMER owner, then emits public voucher names without voucher IDs", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "order-id", user_id: "customer-id", order_code: "BCBM-ABC123", status: "COMPLETED", order_type: "PICKUP",
      created_at: new Date("2026-01-01"), delivery_receiver_name: null, delivery_receiver_phone: null,
      delivery_address: null, address: null, subtotal_vnd: 50_000, total_voucher_discount_vnd: 5_000,
      shipping_fee_vnd: 0, freeship_discount_vnd: 0, grand_total_vnd: 45_000, points_earned: null,
      freeship_voucher_id: null, discountVouchers: [{ voucher: { voucher_type: "DISCOUNT", package: { name: "Giảm 5k" } } }],
      items: [], bundleApplications: [],
    });

    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");

    expect(mocks.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      qr_token: "550e8400-e29b-41d4-a716-446655440000", role: "CUSTOMER",
    } }));
    expect(mocks.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: "550e8400-e29b-41d4-a716-446655440001", user_id: "customer-id",
    } }));
    expect(result?.points_earned).toBeNull();
    expect(JSON.stringify(result)).not.toContain("customer-id");
    expect(JSON.stringify(result)).not.toContain("voucher_id");
    expect(result?.order_vouchers).toEqual([{ name: "Giảm 5k", type: "DISCOUNT" }]);
  });

  it("giữ nguyên loại PRODUCT_DISCOUNT của voucher sản phẩm trong DTO đơn hàng", async () => {
    mocks.orderFindFirst.mockResolvedValue({
      id: "order-id", user_id: "customer-id", order_code: "BCBM-RED001", status: "COMPLETED", order_type: "PICKUP",
      created_at: new Date("2026-01-01"), delivery_receiver_name: null, delivery_receiver_phone: null,
      delivery_address: null, address: null, subtotal_vnd: 50_000, total_voucher_discount_vnd: 5_000,
      shipping_fee_vnd: 0, freeship_discount_vnd: 0, grand_total_vnd: 45_000, points_earned: null,
      freeship_voucher_id: null, discountVouchers: [], bundleApplications: [],
      items: [{
        id: "order-item-id", quantity: 1, size: "M", unit_price_vnd: 50_000, addons_price_vnd: 0,
        total_discount_vnd: 5_000, sweetness: null, ice_option: null, coldwhisk: false, note: null,
        menuItem: { id: "menu-item-id", name: "Matcha", category: "matcha", image_url: null },
        selectedPowder: null, milkType: null, addons: [], itemVoucher: null, addonVouchers: [],
        productVoucher: { voucher_type: "PRODUCT_DISCOUNT", package: { name: "Giảm matcha" } },
      }],
    });

    const result = await getAdminUserOrder("550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001");

    expect(result?.order_vouchers).toEqual([{ name: "Giảm matcha", type: "PRODUCT_DISCOUNT" }]);
    expect(JSON.stringify(result?.order_vouchers)).not.toContain("order-item-id");
  });
});
