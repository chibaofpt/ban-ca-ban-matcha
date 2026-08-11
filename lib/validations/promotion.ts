import { z } from "zod";

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

const packageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  acquisition_mode: z.enum(["POINTS_EXCHANGE", "FREE_CLAIM", "AUTO_GRANT"]),
  points_cost: z.number().int().min(0),
  expires_after_days: z.number().int().min(1).nullable().optional(),
  quantity: z.number().int().min(1).nullable().optional(),
  max_per_user: z.number().int().min(1).max(100).default(1),
});

/** Validates a draft BUNDLE campaign before any database access. */
export const createPromotionSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).optional(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    max_redemptions: z.number().int().min(1).nullable(),
    package: packageSchema,
    bundle_rule: bundleRuleSchema,
  })
  .superRefine((data, ctx) => {
    if (new Date(data.ends_at) <= new Date(data.starts_at)) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
    }
    const usesPoints = data.package.acquisition_mode === "POINTS_EXCHANGE";
    if ((usesPoints && data.package.points_cost < 1) || (!usesPoints && data.package.points_cost !== 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["package", "points_cost"],
        message: usesPoints ? "POINTS_EXCHANGE requires points" : "Free acquisition requires zero points",
      });
    }
    const rule = data.bundle_rule;
    if (
      rule.reward_kind === "PRODUCT" &&
      rule.reward_mode !== "SAME_CONFIG" &&
      rule.reward_product_scopes.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["bundle_rule", "reward_product_scopes"],
        message: "Product reward scope is required",
      });
    }
    if (rule.reward_kind === "PRODUCT" && rule.reward_mode === "FIXED_CONFIG") {
      rule.reward_product_scopes.forEach((scope, index) => {
        if (scope.size == null) {
          ctx.addIssue({
            code: "custom",
            path: ["bundle_rule", "reward_product_scopes", index, "size"],
            message: "FIXED_CONFIG requires an exact size",
          });
        }
        if (scope.powder_id == null) {
          ctx.addIssue({
            code: "custom",
            path: ["bundle_rule", "reward_product_scopes", index, "powder_id"],
            message: "FIXED_CONFIG requires an exact powder",
          });
        }
      });
    }
    if (rule.reward_kind === "PRODUCT" && rule.reward_mode === "ALLOWED_SCOPE") {
      rule.reward_product_scopes.forEach((scope, index) => {
        if ((scope.reference_price_vnd ?? 0) <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["bundle_rule", "reward_product_scopes", index, "reference_price_vnd"],
            message: "ALLOWED_SCOPE requires a positive reference credit",
          });
        }
      });
    }
    if (rule.reward_kind === "ADDON" && rule.reward_addon_option_ids.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["bundle_rule", "reward_addon_option_ids"],
        message: "Addon reward scope is required",
      });
    }
  });

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
