import { describe, expect, it } from "vitest";
import { customerOrderSchema } from "@/lib/validations/order";

const UUID = {
  menu: "22222222-2222-4222-8222-222222222222",
  addon: "33333333-3333-4333-8333-333333333333",
  voucher: "44444444-4444-4444-8444-444444444444",
  line: "55555555-5555-4555-8555-555555555555",
};

function baseOrder() {
  return {
    order_type: "PICKUP",
    items: [{
      client_line_id: UUID.line,
      menu_item_id: UUID.menu,
      quantity: 2,
      size: "SMALL",
      addon_option_ids: [] as Array<{ option_id: string; quantity: number }>,
      addon_voucher_ids: [],
      client_price_vnd: 45_000,
    }],
    bundle_voucher_qr_token: UUID.voucher,
    bundle_reward_allocations: [{ client_line_id: UUID.line, quantity: 1 }] as Array<{
      client_line_id: string;
      quantity: number;
      addon_option_id?: string;
    }>,
  };
}

describe("Validation order có BUNDLE allocation", () => {
  it("nhận product reward allocation tham chiếu client line", () => {
    expect(customerOrderSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it("nhận addon reward allocation có addon_option_id", () => {
    const input = baseOrder();
    input.items[0]?.addon_option_ids.push({ option_id: UUID.addon, quantity: 1 });
    input.bundle_reward_allocations = [
      { client_line_id: UUID.line, addon_option_id: UUID.addon, quantity: 1 },
    ];
    expect(customerOrderSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối allocation khi không gửi bundle voucher", () => {
    const input = { ...baseOrder(), bundle_voucher_qr_token: undefined };
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối bundle voucher không có allocation", () => {
    const input = { ...baseOrder(), bundle_reward_allocations: [] };
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối allocation tham chiếu client line không tồn tại", () => {
    const input = baseOrder();
    input.bundle_reward_allocations = [{
      client_line_id: "66666666-6666-4666-8666-666666666666",
      quantity: 1,
    }];
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });
});
