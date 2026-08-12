import { z } from "zod";

const acquisitionModeSchema = z.enum(["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"]);
const sizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const nullableUuid = z.string().uuid().nullable().optional();

const productScopeSchema = z.object({
  menu_item_id: z.string().uuid(),
  size: sizeSchema.nullable().optional(),
  powder_id: nullableUuid,
  milk_type_id: nullableUuid,
  reference_price_vnd: z.number().int().min(0).optional(),
});

const bundleRuleSchema = z.object({
  buy_quantity: z.number().int().min(1).max(100),
  reward_quantity: z.number().int().min(1).max(100),
  reward_kind: z.enum(["PRODUCT", "ADDON"]),
  reward_mode: z.enum(["SAME_CONFIG", "FIXED_CONFIG", "ALLOWED_SCOPE"]),
  benefit_scaling: z.enum(["PER_BUNDLE", "ONCE_PER_ORDER", "PER_QUALIFYING_ITEM"]),
  max_applications_per_order: z.number().int().min(1).max(100).default(1),
  max_reward_units_per_order: z.number().int().min(1).max(100).nullable().optional(),
  qualifier_scopes: z.array(productScopeSchema).min(1).max(100),
  reward_product_scopes: z.array(productScopeSchema).max(100).default([]),
  reward_addon_option_ids: z.array(z.string().uuid()).max(100).default([]),
});

const commonFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional(),
  acquisition_mode: acquisitionModeSchema.default("POINTS_EXCHANGE"),
  points_cost: z.number().int().min(0),
  ends_at: z.string().datetime().nullable().optional(),
  expires_after_days: z.number().int().min(1).nullable().optional(),
  quantity: z.number().int().min(1).nullable().optional(),
  max_per_user: z.number().int().min(1).max(100).default(1),
};

const minimumOrder = z.number().int().min(1_000).nullable().optional();

const rawVoucherPackageSchema = z.discriminatedUnion("voucher_type", [
  z.object({
    ...commonFields,
    voucher_type: z.literal("DISCOUNT"),
    discount_type: z.enum(["PERCENT", "FIXED"]),
    discount_value: z.number().int().min(1),
    min_order_vnd: minimumOrder,
  }),
  z.object({
    ...commonFields,
    voucher_type: z.literal("PRODUCT"),
    menu_item_id: z.string().uuid(),
    size: sizeSchema,
    matcha_powder_id: nullableUuid,
    milk_type_id: nullableUuid,
    included_addon_option_ids: z.array(z.string().uuid()).max(100).default([]),
  }),
  z.object({
    ...commonFields,
    voucher_type: z.literal("ADDON"),
    addon_option_id: z.string().uuid(),
  }),
  z.object({
    ...commonFields,
    voucher_type: z.literal("FREESHIP"),
    covered_delivery_fee_vnd: z.number().int().min(1_000),
    min_order_vnd: minimumOrder,
  }),
  z.object({
    ...commonFields,
    voucher_type: z.literal("BUNDLE"),
    min_order_vnd: minimumOrder,
    bundle_rule: bundleRuleSchema,
  }),
]);

function scopeKey(scope: z.infer<typeof productScopeSchema>): string {
  return [scope.menu_item_id, scope.size ?? "", scope.powder_id ?? "", scope.milk_type_id ?? ""].join(":");
}

/** Validates every admin voucher package before any database access. */
export const createVoucherPackageSchema = rawVoucherPackageSchema.superRefine((data, ctx) => {
  const usesPoints = data.acquisition_mode === "POINTS_EXCHANGE";
  if ((usesPoints && data.points_cost < 1) || (!usesPoints && data.points_cost !== 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["points_cost"],
      message: usesPoints ? "POINTS_EXCHANGE requires positive points" : "Free acquisition requires zero points",
    });
  }
  if (data.ends_at && new Date(data.ends_at) <= new Date()) {
    ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be in the future" });
  }
  if (
    data.voucher_type === "DISCOUNT" &&
    data.discount_type === "FIXED" &&
    data.discount_value % 1_000 !== 0
  ) {
    ctx.addIssue({ code: "custom", path: ["discount_value"], message: "FIXED value must be divisible by 1000" });
  }
  if (
    data.voucher_type === "DISCOUNT" &&
    data.discount_type === "PERCENT" &&
    data.discount_value > 100
  ) {
    ctx.addIssue({ code: "custom", path: ["discount_value"], message: "PERCENT value cannot exceed 100" });
  }
  if (data.voucher_type !== "BUNDLE") return;

  const rule = data.bundle_rule;
  for (const [path, values] of [
    ["qualifier_scopes", rule.qualifier_scopes.map(scopeKey)],
    ["reward_product_scopes", rule.reward_product_scopes.map(scopeKey)],
    ["reward_addon_option_ids", rule.reward_addon_option_ids],
  ] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", path], message: "Duplicate bundle scope" });
    }
  }
  if (rule.reward_kind === "PRODUCT") {
    if (rule.reward_addon_option_ids.length > 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_addon_option_ids"], message: "Product bundle cannot include addon rewards" });
    }
    if (rule.reward_mode !== "SAME_CONFIG" && rule.reward_product_scopes.length === 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_product_scopes"], message: "Product reward scope is required" });
    }
    if (
      rule.reward_mode === "FIXED_CONFIG" &&
      rule.reward_product_scopes.some((scope) => !scope.size || !scope.powder_id)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["bundle_rule", "reward_product_scopes"],
        message: "Fixed product rewards require size and powder",
      });
    }
    if (
      rule.reward_mode === "ALLOWED_SCOPE" &&
      rule.reward_product_scopes.some(
        (scope) => !scope.reference_price_vnd || scope.reference_price_vnd % 1_000 !== 0,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["bundle_rule", "reward_product_scopes"],
        message: "Allowed product rewards require a positive 1,000 VND reference price",
      });
    }
  } else {
    if (rule.reward_addon_option_ids.length === 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_addon_option_ids"], message: "Addon reward scope is required" });
    }
    if (rule.reward_product_scopes.length > 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_product_scopes"], message: "Addon bundle cannot include product rewards" });
    }
  }
});

export type CreateVoucherPackageInput = z.infer<typeof createVoucherPackageSchema>;
