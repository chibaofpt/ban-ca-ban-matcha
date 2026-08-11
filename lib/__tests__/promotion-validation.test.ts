import { describe, expect, it } from "vitest";
import { createPromotionSchema } from "@/lib/validations/promotion";
import { customerOrderSchema } from "@/lib/validations/order";

const UUIDS = {
  package: "11111111-1111-4111-8111-111111111111",
  menu: "22222222-2222-4222-8222-222222222222",
  addon: "33333333-3333-4333-8333-333333333333",
  voucher: "44444444-4444-4444-8444-444444444444",
  line: "55555555-5555-4555-8555-555555555555",
};

function basePromotion() {
  return {
    title: "Mua 1 tặng 1",
    description: "Deal mở bán",
    starts_at: "2026-08-11T00:00:00.000Z",
    ends_at: "2026-08-20T00:00:00.000Z",
    max_redemptions: null,
    package: {
      name: "Voucher mua 1 tặng 1",
      acquisition_mode: "AUTO_GRANT",
      points_cost: 0,
      expires_after_days: 30,
      quantity: null,
      max_per_user: 1,
    },
    bundle_rule: {
      buy_quantity: 1,
      reward_quantity: 1,
      reward_kind: "PRODUCT",
      reward_mode: "SAME_CONFIG",
      benefit_scaling: "PER_BUNDLE",
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
      qualifier_scopes: [{ menu_item_id: UUIDS.menu }],
      reward_product_scopes: [] as Array<{
        menu_item_id: string;
        size?: "SMALL" | "MEDIUM" | "LARGE";
        powder_id?: string;
        milk_type_id?: string;
      }>,
      reward_addon_option_ids: [] as string[],
    },
  };
}

describe("Validation tạo promotion BUNDLE", () => {
  it("nhận cấu hình mua 1 tặng 1 SAME_CONFIG tự cấp", () => {
    expect(createPromotionSchema.safeParse(basePromotion()).success).toBe(true);
  });

  it("nhận deal addon theo từng món với danh sách addon được phép", () => {
    const input = basePromotion();
    input.bundle_rule = {
      ...input.bundle_rule,
      buy_quantity: 2,
      reward_quantity: 2,
      reward_kind: "ADDON",
      reward_mode: "ALLOWED_SCOPE",
      benefit_scaling: "PER_QUALIFYING_ITEM",
      reward_addon_option_ids: [UUIDS.addon],
    };

    expect(createPromotionSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối buy/reward quantity bằng 0", () => {
    const input = basePromotion();
    input.bundle_rule.buy_quantity = 0;
    input.bundle_rule.reward_quantity = 0;

    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối thời gian kết thúc không sau bắt đầu", () => {
    const input = { ...basePromotion(), ends_at: "2026-08-10T00:00:00.000Z" };
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối POINTS_EXCHANGE có points_cost bằng 0", () => {
    const input = basePromotion();
    input.package = {
      ...input.package,
      acquisition_mode: "POINTS_EXCHANGE",
      points_cost: 0,
    };

    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối FREE_CLAIM hoặc AUTO_GRANT có points_cost khác 0", () => {
    const input = basePromotion();
    input.package.points_cost = 10;
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối PRODUCT ALLOWED_SCOPE không có reward product scope", () => {
    const input = basePromotion();
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối FIXED_CONFIG không chốt size của món quà", () => {
    const input = basePromotion();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    input.bundle_rule.reward_product_scopes = [{ menu_item_id: UUIDS.menu }];
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối FIXED_CONFIG không chốt bột của món quà", () => {
    const input = basePromotion();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    input.bundle_rule.reward_product_scopes = [
      { menu_item_id: UUIDS.menu, size: "SMALL" },
    ];
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("nhận FIXED_CONFIG đã chốt size và bột", () => {
    const input = basePromotion();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    input.bundle_rule.reward_product_scopes = [
      { menu_item_id: UUIDS.menu, size: "SMALL", powder_id: UUIDS.package },
    ];
    expect(createPromotionSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối ALLOWED_SCOPE không có hạn mức giá dương", () => {
    const input = basePromotion();
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    input.bundle_rule.reward_product_scopes = [{ menu_item_id: UUIDS.menu }];
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối ADDON không có addon option được phép", () => {
    const input = basePromotion();
    input.bundle_rule.reward_kind = "ADDON";
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    input.bundle_rule.benefit_scaling = "ONCE_PER_ORDER";
    expect(createPromotionSchema.safeParse(input).success).toBe(false);
  });
});

describe("Validation order có BUNDLE allocation", () => {
  function baseOrder() {
    return {
      order_type: "PICKUP",
      items: [
        {
          client_line_id: UUIDS.line,
          menu_item_id: UUIDS.menu,
          quantity: 2,
          size: "SMALL",
          addon_option_ids: [] as Array<{ option_id: string; quantity: number }>,
          addon_voucher_ids: [],
          client_price_vnd: 45_000,
        },
      ],
      bundle_voucher_qr_token: UUIDS.voucher,
      bundle_reward_allocations: [{ client_line_id: UUIDS.line, quantity: 1 }] as Array<{
        client_line_id: string;
        quantity: number;
        addon_option_id?: string;
      }>,
    };
  }

  it("nhận product reward allocation tham chiếu client line", () => {
    expect(customerOrderSchema.safeParse(baseOrder()).success).toBe(true);
  });

  it("nhận addon reward allocation có addon_option_id", () => {
    const input = baseOrder();
    input.items[0]?.addon_option_ids.push({ option_id: UUIDS.addon, quantity: 1 });
    input.bundle_reward_allocations = [
      { client_line_id: UUIDS.line, addon_option_id: UUIDS.addon, quantity: 1 },
    ];
    expect(customerOrderSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối allocation khi không gửi bundle_voucher_qr_token", () => {
    const input = baseOrder();
    const withoutVoucher = { ...input, bundle_voucher_qr_token: undefined };
    expect(customerOrderSchema.safeParse(withoutVoucher).success).toBe(false);
  });

  it("từ chối bundle voucher không có allocation", () => {
    const input = { ...baseOrder(), bundle_reward_allocations: [] };
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });

  it("từ chối allocation tham chiếu client line không tồn tại trong items", () => {
    const input = baseOrder();
    input.bundle_reward_allocations = [
      { client_line_id: "66666666-6666-4666-8666-666666666666", quantity: 1 },
    ];
    expect(customerOrderSchema.safeParse(input).success).toBe(false);
  });
});
