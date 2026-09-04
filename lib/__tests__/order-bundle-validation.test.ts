import { describe, expect, it } from "vitest";
import { customerOrderSchema } from "@/lib/validations/order";

const UUID = {
  menu: "22222222-2222-4222-8222-222222222222", addon: "33333333-3333-4333-8333-333333333333",
  voucher: "44444444-4444-4444-8444-444444444444", voucher2: "77777777-7777-4777-8777-777777777777",
  line: "55555555-5555-4555-8555-555555555555", line2: "66666666-6666-4666-8666-666666666666",
};

function baseOrder() {
  return {
    order_type: "PICKUP",
    items: [
      { client_line_id: UUID.line, menu_item_id: UUID.menu, quantity: 2, size: "SMALL",
        addon_option_ids: [] as string[], addon_voucher_ids: [], client_price_vnd: 45_000 },
      { client_line_id: UUID.line2, menu_item_id: UUID.menu, quantity: 2, size: "MEDIUM",
        addon_option_ids: [], addon_voucher_ids: [], client_price_vnd: 55_000 },
    ],
    bundle_applications: [{
      voucher_qr_token: UUID.voucher,
      qualifier_allocations: [{ client_line_id: UUID.line, quantity: 1 }],
      reward_allocations: [{ client_line_id: UUID.line, quantity: 1 }] as Array<{
        client_line_id: string; quantity: number; addon_option_id?: string;
      }>,
    }],
  };
}

describe("Validation order có nhiều BUNDLE applications", () => {
  it("nhận nhiều voucher với qualifier và reward rõ ràng", () => {
    const input = baseOrder();
    input.bundle_applications.push({ voucher_qr_token: UUID.voucher2,
      qualifier_allocations: [{ client_line_id: UUID.line2, quantity: 1 }],
      reward_allocations: [{ client_line_id: UUID.line2, quantity: 1 }] });
    expect(customerOrderSchema.safeParse(input).success).toBe(true);
  });

  it("nhận addon reward nằm trên qualifier line", () => {
    const input = baseOrder();
    input.items[0]!.addon_option_ids.push(UUID.addon);
    input.bundle_applications[0]!.reward_allocations = [{ client_line_id: UUID.line,
      quantity: 1, addon_option_id: UUID.addon }];
    expect(customerOrderSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối token trùng trong cùng order", () => {
    const input = baseOrder();
    input.bundle_applications.push({ ...input.bundle_applications[0]! });
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối allocation tham chiếu line không tồn tại", () => {
    const input = baseOrder();
    input.bundle_applications[0]!.qualifier_allocations[0]!.client_line_id =
      "88888888-8888-4888-8888-888888888888";
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối các field BUNDLE singular cũ", () => {
    const input = { ...baseOrder(), bundle_applications: undefined,
      bundle_voucher_qr_token: UUID.voucher,
      bundle_reward_allocations: [{ client_line_id: UUID.line, quantity: 1 }] };
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });
});
