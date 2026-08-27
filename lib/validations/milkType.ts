import { z } from "zod";

const milkTypeFields = z.object({
  name: z.string().min(1, "Vui lòng nhập tên loại sữa").max(100, "Tên không được vượt quá 100 ký tự"),
  price_per_ml: z.number().int("Giá phải là số nguyên").min(0, "Giá không được âm"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  image_url: z.string().url().optional().nullable(),
  /** Injected by parseCatalogRequest when client sends image_filename for SEO rename. */
  image_filename: z.string().max(200).optional(),
});

const defaultMustBeActive = (
  value: { is_default?: boolean; is_active?: boolean },
  ctx: z.RefinementCtx,
) => {
  if (value.is_default === true && value.is_active === false) {
    ctx.addIssue({
      code: "custom",
      path: ["is_active"],
      message: "Base Liquid mặc định phải đang hoạt động",
    });
  }
};

export const createMilkTypeSchema = milkTypeFields.superRefine(defaultMustBeActive);

export const updateMilkTypeSchema = milkTypeFields.partial().extend({
  /** Set to true to explicitly remove the current image. */
  remove_image: z.boolean().optional(),
}).superRefine(defaultMustBeActive);

export type CreateMilkTypeInput = z.infer<typeof createMilkTypeSchema>;
export type UpdateMilkTypeInput = z.infer<typeof updateMilkTypeSchema>;
