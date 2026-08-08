import { z } from "zod";

const sizeSchema = z.object({
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  base_price_vnd: z.number().int().min(0).nullable(),
});

const customPowderGramsSchema = z
  .object({
    SMALL: z.number().positive().optional(),
    MEDIUM: z.number().positive().optional(),
    LARGE: z.number().positive().optional(),
  })
  .nullable()
  .optional();

/** Optional SEO filename stored only in the Supabase object path. */
export const imageFilenameSchema = z
  .string()
  .trim()
  .max(80, "Tên file ảnh tối đa 80 ký tự")
  .refine(
    (value) => !value.includes("..") && !value.includes("/") && !value.includes("\\") && !value.includes("\0"),
    "Tên file ảnh không hợp lệ",
  )
  .optional();

/** Validates that sizes array has exactly 3 rows covering SMALL, MEDIUM, LARGE. */
const sizesSchema = z
  .array(sizeSchema)
  .length(3)
  .refine(
    (sizes) => {
      const keys = new Set(sizes.map((s) => s.size));
      return keys.has("SMALL") && keys.has("MEDIUM") && keys.has("LARGE");
    },
    { message: "Phải có đủ 3 size SMALL, MEDIUM, LARGE" }
  );

const baseMenuSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên món"),
  description: z.string().optional().nullable(),
  is_available: z.boolean().default(true),
  is_seasonal: z.boolean().default(false),
  image_url: z.string().url().optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
  sizes: sizesSchema,
  custom_powder_grams: customPowderGramsSchema,
  image_filename: imageFilenameSchema,
});

export const createLatteMenuSchema = baseMenuSchema.extend({
  category: z.literal("latte"),
  matcha_powder_id: z.string().uuid("matcha_powder_id phải là UUID hợp lệ").optional().nullable(),
});

export const createFusionMenuSchema = baseMenuSchema.extend({
  category: z.literal("fusion"),
  default_powder_id: z.string().uuid("default_powder_id phải là UUID hợp lệ").optional().nullable(),
  base_liquid_note: z.string().max(200).optional().nullable(),
});

export const createMenuSchema = z.discriminatedUnion("category", [
  createLatteMenuSchema,
  createFusionMenuSchema,
]);

/**
 * Update schema — all fields optional. category still required to discriminate.
 * Build as a separate object rather than unwrapping the discriminated union.
 */
export const updateMenuSchema = z.object({
  category: z.enum(["latte", "fusion"]).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  is_available: z.boolean().optional(),
  is_seasonal: z.boolean().optional(),
  image_url: z.string().url().optional().nullable(),
  image_filename: imageFilenameSchema,
  sort_order: z.number().int().min(0).optional(),
  sizes: sizesSchema.optional(),
  custom_powder_grams: customPowderGramsSchema,
  // Latte
  matcha_powder_id: z.string().uuid().optional().nullable(),
  // Fusion
  default_powder_id: z.string().uuid().optional().nullable(),
  base_liquid_note: z.string().max(200).optional().nullable(),
  /** Fusion only — replaces all fusionAllowedPowder rows when provided. */
  allowed_powder_ids: z.array(z.string().uuid()).optional(),
});

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
