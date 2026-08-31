import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoucherPackageSchema } from "@/lib/validations/voucherPackage";

const UUID = {
  menu: "11111111-1111-4111-8111-111111111111",
  menu2: "33333333-3333-4333-8333-333333333333",
  powder: "44444444-4444-4444-8444-444444444444",
  milk: "55555555-5555-4555-8555-555555555555",
  addon: "22222222-2222-4222-8222-222222222222",
};

const product = (menu_item_id = UUID.menu) => ({
  menu_item_id,
  default_powder_id: UUID.powder,
  default_base_liquid_id: UUID.milk,
  allowed_sizes: ["MEDIUM", "LARGE"] as const,
});

describe("Validation PRODUCT_DISCOUNT", () => {
  const common = {
    voucher_type: "PRODUCT_DISCOUNT" as const,
    name: "Giam theo mon",
    acquisition_mode: "POINTS_EXCHANGE" as const,
    points_cost: 10,
    menu_item_id: UUID.menu,
    eligible_menu_item_ids: [UUID.menu],
    eligible_sizes: ["MEDIUM", "LARGE"] as const,
  };

  it("nhận legacy menu_item_id và chuẩn hóa danh sách mục tiêu mới", () => {
    const legacy = { ...common, product_discount_mode: "FIXED_AMOUNT" as const, discount_value: 10_000 };
    delete (legacy as Partial<typeof legacy>).eligible_menu_item_ids;
    expect(createVoucherPackageSchema.safeParse(legacy).success).toBe(true);
    expect(createVoucherPackageSchema.safeParse({ ...common, eligible_menu_item_ids: [] }).success).toBe(false);
  });

  it("từ chối mục tiêu trùng, quá 100 hoặc anchor nằm ngoài scope", () => {
    const benefit = { product_discount_mode: "FIXED_AMOUNT" as const, discount_value: 10_000 };
    expect(createVoucherPackageSchema.safeParse({ ...common, ...benefit, eligible_menu_item_ids: [UUID.menu, UUID.menu] }).success).toBe(false);
    const tooMany = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect(createVoucherPackageSchema.safeParse({ ...common, ...benefit, eligible_menu_item_ids: tooMany }).success).toBe(false);
    expect(createVoucherPackageSchema.safeParse({ ...common, ...benefit, eligible_menu_item_ids: [UUID.menu2] }).success).toBe(false);
  });

  it("nhan FIXED_AMOUNT duong va chia het cho 1.000", () => {
    expect(createVoucherPackageSchema.safeParse({ ...common, product_discount_mode: "FIXED_AMOUNT", discount_value: 10_000 }).success).toBe(true);
  });

  it("tu choi eligible_sizes rong, trung hoac gia le 1.000", () => {
    expect(createVoucherPackageSchema.safeParse({ ...common, eligible_sizes: [], product_discount_mode: "FIXED_AMOUNT", discount_value: 10_000 }).success).toBe(false);
    expect(createVoucherPackageSchema.safeParse({ ...common, eligible_sizes: ["MEDIUM", "MEDIUM"], product_discount_mode: "FIXED_AMOUNT", discount_value: 10_000 }).success).toBe(false);
    expect(createVoucherPackageSchema.safeParse({ ...common, product_discount_mode: "FIXED_AMOUNT", discount_value: 10_500 }).success).toBe(false);
  });

  it("PAY_AS_SIZE yeu cau reference size thap hon moi eligible size", () => {
    expect(createVoucherPackageSchema.safeParse({ ...common, product_discount_mode: "PAY_AS_SIZE", reference_size: "SMALL" }).success).toBe(true);
    expect(createVoucherPackageSchema.safeParse({ ...common, product_discount_mode: "PAY_AS_SIZE", reference_size: "MEDIUM" }).success).toBe(false);
  });
});

function makeBundle() {
  return {
    voucher_type: "BUNDLE" as const, name: "Mua 2 tặng 1", acquisition_mode: "POINTS_EXCHANGE" as const,
    points_cost: 10, ends_at: "2026-08-31T16:59:59.999Z", min_order_vnd: 100_000,
    expires_after_days: 30, quantity: 100, max_per_user: 1,
    bundle_rule: {
      buy_quantity: 2, reward_quantity: 1, reward_kind: "PRODUCT" as "PRODUCT" | "ADDON",
      reward_mode: "SAME_CONFIG" as "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE",
      benefit_scaling: "PER_BUNDLE" as "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM",
      max_applications_per_order: 1, max_reward_units_per_order: null,
      qualifier_products: [product()], reward_products: [] as ReturnType<typeof product>[],
      reward_addon_option_ids: [] as string[],
    },
  };
}

describe("Validation gói BUNDLE grouped products", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("nhận một product có nhiều allowed sizes và snapshot default", () => {
    expect(createVoucherPackageSchema.safeParse(makeBundle()).success).toBe(true);
  });

  it("từ chối product hoặc allowed size trùng", () => {
    const duplicateProduct = makeBundle();
    duplicateProduct.bundle_rule.qualifier_products.push(product());
    expect(createVoucherPackageSchema.safeParse(duplicateProduct).success).toBe(false);

    const duplicateSize = makeBundle();
    duplicateSize.bundle_rule.qualifier_products[0]!.allowed_sizes = ["MEDIUM", "MEDIUM"] as never;
    expect(createVoucherPackageSchema.safeParse(duplicateSize).success).toBe(false);
  });

  it("SAME_CONFIG không nhận reward_products", () => {
    const input = makeBundle();
    input.bundle_rule.reward_products = [product(UUID.menu2)];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
  });

  it("FIXED_CONFIG yêu cầu đúng một reward product", () => {
    const input = makeBundle();
    input.bundle_rule.reward_mode = "FIXED_CONFIG";
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
    input.bundle_rule.reward_products = [product(UUID.menu2)];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
    input.bundle_rule.reward_products.push(product());
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
  });

  it("ALLOWED_SCOPE nhận nhiều product mà không có reference price", () => {
    const input = makeBundle();
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    input.bundle_rule.reward_products = [product(), product(UUID.menu2)];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
  });

  it("từ chối contract scope/reference price cũ", () => {
    const input = makeBundle() as Record<string, unknown>;
    const rule = input.bundle_rule as Record<string, unknown>;
    delete rule.qualifier_products;
    rule.qualifier_scopes = [{ menu_item_id: UUID.menu, reference_price_vnd: 50_000 }];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
  });

  it("ADDON yêu cầu addon list và không nhận reward product", () => {
    const input = makeBundle();
    input.bundle_rule.reward_kind = "ADDON";
    input.bundle_rule.reward_mode = "ALLOWED_SCOPE";
    input.bundle_rule.benefit_scaling = "ONCE_PER_ORDER";
    input.bundle_rule.reward_addon_option_ids = [UUID.addon];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(true);
    input.bundle_rule.reward_products = [product(UUID.menu2)];
    expect(createVoucherPackageSchema.safeParse(input).success).toBe(false);
  });

  it("giữ validation acquisition và ngày hết hạn hiện có", () => {
    expect(createVoucherPackageSchema.safeParse({ ...makeBundle(), points_cost: 0 }).success).toBe(false);
    expect(createVoucherPackageSchema.safeParse({ ...makeBundle(), acquisition_mode: "FREE_CLAIM", points_cost: 0 }).success).toBe(true);
    expect(createVoucherPackageSchema.safeParse({ ...makeBundle(), ends_at: "2026-01-01T00:00:00.000Z" }).success).toBe(false);
  });
});
