import { z } from "zod";

const milkTypeFields = z.object({
  name: z.string().min(1, "Vui lòng nhập tên loại sữa").max(100, "Tên không được vượt quá 100 ký tự"),
  price_per_ml: z.number().int("Giá phải là số nguyên").min(0, "Giá không được âm"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
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

export const updateMilkTypeSchema = milkTypeFields.partial().superRefine(defaultMustBeActive);

export type CreateMilkTypeInput = z.infer<typeof createMilkTypeSchema>;
export type UpdateMilkTypeInput = z.infer<typeof updateMilkTypeSchema>;
