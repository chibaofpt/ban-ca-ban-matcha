import { z } from "zod";
import { imageFilenameSchema } from "@/lib/validations/menu";

/** Schema cho phần bột mới tạo inline cùng với Latte. */
const inlinePowderSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên bột"),
  price_per_gram: z
    .number()
    .int("Giá phải là số nguyên VND")
    .min(0, "Giá không được âm"),
  /** Per-powder gram exception — nếu không có thì dùng default_size_config. */
  size_config: z
    .array(
      z.object({
        size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
        grams: z.number().positive(),
      })
    )
    .max(3)
    .optional(),
});

const sizeRowSchema = z.object({
  size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  base_price_vnd: z.number().int().min(0).nullable(),
});

const sizesSchema = z
  .array(sizeRowSchema)
  .length(3)
  .refine(
    (sizes) => {
      const keys = new Set(sizes.map((s) => s.size));
      return keys.has("SMALL") && keys.has("MEDIUM") && keys.has("LARGE");
    },
    { message: "Phải có đủ 3 size SMALL, MEDIUM, LARGE" }
  );

const customPowderGramsSchema = z
  .object({
    SMALL: z.number().positive().optional(),
    MEDIUM: z.number().positive().optional(),
    LARGE: z.number().positive().optional(),
  })
  .nullable()
  .optional();

/**
 * Schema cho POST /api/admin/menu/create-latte-with-powder.
 * Nhận dữ liệu menu item Latte + inline powder mới.
 * Dùng trong route handler sau khi parse FormData.
 */
export const createLatteWithPowderSchema = z.object({
  // ── Menu item fields ──────────────────────────────────────────────────────
  name: z.string().min(1, "Vui lòng nhập tên món"),
  description: z.string().optional().nullable(),
  is_available: z.boolean().default(true),
  is_seasonal: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  sizes: sizesSchema,
  custom_powder_grams: customPowderGramsSchema,
  image_filename: imageFilenameSchema,

  // ── Inline powder fields ──────────────────────────────────────────────────
  new_powder: inlinePowderSchema,
});

export type CreateLatteWithPowderInput = z.infer<typeof createLatteWithPowderSchema>;
