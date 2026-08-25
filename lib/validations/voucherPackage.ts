import { z } from "zod";

const acquisitionModeSchema = z.enum(["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"]);
const sizeSchema = z.enum(["SMALL", "MEDIUM", "LARGE"]);
const nullableUuid = z.string().uuid().nullable().optional();

const bundleProductSchema = z.object({
  menu_item_id: z.string().uuid(),
  default_powder_id: nullableUuid,
  default_base_liquid_id: nullableUuid,
  allowed_sizes: z.array(sizeSchema).max(3).default([]),
}).strict();

const bundleRuleSchema = z.object({
  buy_quantity: z.number().int().min(1).max(100),
  reward_quantity: z.number().int().min(1).max(100),
  reward_kind: z.enum(["PRODUCT", "ADDON"]),
  reward_mode: z.enum(["SAME_CONFIG", "FIXED_CONFIG", "ALLOWED_SCOPE"]),
  benefit_scaling: z.enum(["PER_BUNDLE", "ONCE_PER_ORDER", "PER_QUALIFYING_ITEM"]),
  max_applications_per_order: z.number().int().min(1).max(100).default(1),
  max_reward_units_per_order: z.number().int().min(1).max(100).nullable().optional(),
  qualifier_products: z.array(bundleProductSchema).min(1).max(100),
  reward_products: z.array(bundleProductSchema).max(100).default([]),
  reward_addon_option_ids: z.array(z.string().uuid()).max(100).default([]),
}).strict();

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
    voucher_type: z.literal("ITEM"),
    menu_item_id: z.string().uuid(),
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
    voucher_type: z.literal("PRODUCT_DISCOUNT"),
    menu_item_id: z.string().uuid(),
    eligible_menu_item_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
    product_discount_mode: z.enum(["FIXED_AMOUNT", "PAY_AS_SIZE"]),
    eligible_sizes: z.array(sizeSchema).min(1).max(3),
    discount_value: z.number().int().positive().optional(),
    reference_size: sizeSchema.optional(),
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
    (data.voucher_type === "DISCOUNT" || (data.voucher_type === "PRODUCT_DISCOUNT" && data.product_discount_mode === "FIXED_AMOUNT")) &&
    (data.voucher_type !== "DISCOUNT" || data.discount_type === "FIXED") &&
    data.discount_value !== undefined && data.discount_value % 1_000 !== 0
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
  if (data.voucher_type === "PRODUCT_DISCOUNT") {
    if (data.eligible_menu_item_ids) {
      if (new Set(data.eligible_menu_item_ids).size !== data.eligible_menu_item_ids.length) {
        ctx.addIssue({ code: "custom", path: ["eligible_menu_item_ids"], message: "Duplicate eligible menu item" });
      }
      if (!data.eligible_menu_item_ids.includes(data.menu_item_id)) {
        ctx.addIssue({ code: "custom", path: ["menu_item_id"], message: "Legacy anchor must belong to eligible scope" });
      }
    }
    if (new Set(data.eligible_sizes).size !== data.eligible_sizes.length) {
      ctx.addIssue({ code: "custom", path: ["eligible_sizes"], message: "Duplicate eligible size" });
    }
    if (data.product_discount_mode === "FIXED_AMOUNT") {
      if (data.discount_value === undefined) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "FIXED_AMOUNT requires discount_value" });
      }
      if (data.reference_size !== undefined) {
        ctx.addIssue({ code: "custom", path: ["reference_size"], message: "FIXED_AMOUNT does not accept reference_size" });
      }
    } else {
      const rank = { SMALL: 0, MEDIUM: 1, LARGE: 2 } as const;
      if (!data.reference_size || data.eligible_sizes.some((size) => rank[size] <= rank[data.reference_size!])) {
        ctx.addIssue({ code: "custom", path: ["reference_size"], message: "reference_size must rank below every eligible size" });
      }
      if (data.discount_value !== undefined) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "PAY_AS_SIZE does not accept discount_value" });
      }
    }
  }
  if (data.voucher_type !== "BUNDLE") return;

  const rule = data.bundle_rule;
  for (const [path, values] of [["qualifier_products", rule.qualifier_products.map((product) => product.menu_item_id)],
    ["reward_products", rule.reward_products.map((product) => product.menu_item_id)],
    ["reward_addon_option_ids", rule.reward_addon_option_ids]] as const) {
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", path], message: "Duplicate bundle scope" });
    }
  }
  for (const [path, products] of [["qualifier_products", rule.qualifier_products],
    ["reward_products", rule.reward_products]] as const) {
    if (products.some((product) => new Set(product.allowed_sizes).size !== product.allowed_sizes.length)) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", path], message: "Duplicate allowed size" });
    }
  }
  if (rule.reward_kind === "PRODUCT") {
    if (rule.reward_addon_option_ids.length > 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_addon_option_ids"], message: "Product bundle cannot include addon rewards" });
    }
    if (rule.benefit_scaling !== "PER_BUNDLE") {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "benefit_scaling"], message: "Product rewards require PER_BUNDLE scaling" });
    }
    const expectedRewards = rule.reward_mode === "SAME_CONFIG" ? 0 : rule.reward_mode === "FIXED_CONFIG" ? 1 : null;
    if ((expectedRewards !== null && rule.reward_products.length !== expectedRewards) ||
        (rule.reward_mode === "ALLOWED_SCOPE" && rule.reward_products.length < 1)) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_products"],
        message: "Reward products do not match the selected reward mode" });
    }
  } else {
    if (rule.reward_addon_option_ids.length === 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_addon_option_ids"], message: "Addon reward scope is required" });
    }
    if (rule.reward_products.length > 0) {
      ctx.addIssue({ code: "custom", path: ["bundle_rule", "reward_products"], message: "Addon bundle cannot include product rewards" });
    }
  }
});

export type CreateVoucherPackageInput = z.infer<typeof createVoucherPackageSchema>;
