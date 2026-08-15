import { describe, expect, it } from "vitest";
import { createVoucherPackageSchema } from "@/lib/validations/voucherPackage";

const UUID = {
  menu: "11111111-1111-4111-8111-111111111111",
  extra: "33333333-3333-4333-8333-333333333333",
  addon: "22222222-2222-4222-8222-222222222222",
};

function makeBundle() {
  return {
    voucher_type: "BUNDLE" as const,
    name: "Mua 2 tặng 1",
    description: "Ưu đãi thử nghiệm",
    acquisition_mode: "POINTS_EXCHANGE" as const,
    points_cost: 10,
    ends_at: "2026-08-31T16:59:59.999Z",
    min_order_vnd: 100_000,
    expires_after_days: 30,
    quantity: 100,
    max_per_user: 1,
    bundle_rule: {
      buy_quantity: 2,
      reward_quantity: 1,
      reward_kind: "PRODUCT" as "PRODUCT" | "ADDON",
      reward_mode: "SAME_CONFIG" as "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE",
      benefit_scaling: "PER_BUNDLE" as const,
      max_applications_per_order: 1,
      max_reward_units_per_order: null,
      qualifier_scopes: [{ menu_item_id: UUID.menu }],
      reward_product_scopes: [] as Array<{
        menu_item_id: string;
        size?: "SMALL" | "MEDIUM" | "LARGE" | null;
        powder_id?: string | null;
        milk_type_id?: string | null;
        reference_price_vnd?: number;
      }>,
      reward_addon_option_ids: [] as string[],
    },
  };
}

describe("Validation gói voucher hợp nhất", () => {
  it("nhận BUNDLE có ngày kết thúc nhưng không có ngày bắt đầu", () => {
    expect(createVoucherPackageSchema.safeParse(makeBundle()).success).toBe(true);
  });

  it("không đưa giới hạn lượt toàn campaign vào rule BUNDLE", () => {
    const input: Record<string, unknown> = makeBundle();
    const bundleRule = input.bundle_rule as Record<string, unknown>;
    bundleRule.max_redemptions = 100;
    const result = createVoucherPackageSchema.parse(input);
    expect(result.voucher_type).toBe("BUNDLE");
    if (result.voucher_type === "BUNDLE") {
      expect(result.bundle_rule).not.toHaveProperty("max_redemptions");
    }
  });

  it("nhận voucher không có ngày kết thúc", () => {
    const input = { ...makeBundle(), ends_at: null };
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối ngày kết thúc đã qua", () => {
    const input = { ...makeBundle(), ends_at: "2026-01-01T00:00:00.000Z" };
    const result = createVoucherPackageSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("yêu cầu điểm dương riêng cho POINTS_EXCHANGE", () => {
    expect(
      createVoucherPackageSchema.safeParse({ ...makeBundle(), points_cost: 0 }).success,
    ).toBe(false);
    expect(
      createVoucherPackageSchema.safeParse({
        ...makeBundle(),
        acquisition_mode: "FREE_CLAIM",
        points_cost: 0,
      }).success,
    ).toBe(true);
  });

  it("từ chối FREE_CLAIM và AUTO_GRANT có giá điểm", () => {
    for (const acquisitionMode of ["FREE_CLAIM", "AUTO_GRANT"] as const) {
      expect(
        createVoucherPackageSchema.safeParse({
          ...makeBundle(),
          acquisition_mode: acquisitionMode,
          points_cost: 1,
        }).success,
      ).toBe(false);
    }
  });

  it("chỉ cho một loại quà PRODUCT hoặc ADDON trong mỗi BUNDLE", () => {
    const input = makeBundle();
    input.bundle_rule.reward_addon_option_ids = [UUID.addon];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
  });

  it("yêu cầu danh sách addon khi quà là ADDON", () => {
    const input = makeBundle();
    input.bundle_rule.reward_kind = "ADDON";
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
    input.bundle_rule.reward_addon_option_ids = [UUID.addon];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("giới hạn mỗi danh sách scope ở 100 phần tử và không nhận phần tử trùng", () => {
    const oversized = makeBundle();
    oversized.bundle_rule.qualifier_scopes = Array.from({ length: 101 }, () => ({
      menu_item_id: UUID.menu,
    }));
    expect(createVoucherPackageSchema.safeParse(oversized).success).toBe(false);

    const duplicated = makeBundle();
    duplicated.bundle_rule.qualifier_scopes = [
      { menu_item_id: UUID.menu },
      { menu_item_id: UUID.menu },
    ];
    expect(createVoucherPackageSchema.safeParse(duplicated).success).toBe(false);
  });

  it("để validation cấu hình FIXED_CONFIG theo category cho tầng DB", () => {
    const input = makeBundle();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    input.bundle_rule.reward_product_scopes = [{ menu_item_id: UUID.menu }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);

    input.bundle_rule.reward_product_scopes = [{
      menu_item_id: UUID.menu,
      size: "MEDIUM",
      powder_id: UUID.addon,
    }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("FIXED_CONFIG nhận scope không cấu hình để server đối chiếu category từ DB", () => {
    const input = makeBundle();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    input.bundle_rule.reward_product_scopes = [{
      menu_item_id: UUID.extra,
      size: null,
      powder_id: null,
      milk_type_id: null,
    }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);

    input.bundle_rule.reward_product_scopes = [{
      menu_item_id: UUID.menu,
      size: null,
      powder_id: null,
    }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("yêu cầu hạn mức giá dương cho từng quà PRODUCT trong phạm vi", () => {
    const input = makeBundle();
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    input.bundle_rule.reward_product_scopes = [{
      menu_item_id: UUID.menu,
      reference_price_vnd: 0,
    }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);

    input.bundle_rule.reward_product_scopes[0].reference_price_vnd = 50_000;
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối voucher phần trăm vượt quá 100%", () => {
    const input = {
      ...makeBundle(),
      voucher_type: "DISCOUNT" as const,
      discount_type: "PERCENT" as const,
      discount_value: 101,
    };
    const discount: Record<string, unknown> = { ...input };
    delete discount.bundle_rule;
    expect(createVoucherPackageSchema.safeParse(discount).success).toBe(false);
  });
});
