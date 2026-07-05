import { z } from "zod";

export const createMilkTypeSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên loại sữa").max(100, "Tên không được vượt quá 100 ký tự"),
  price_per_ml: z.number().int("Giá phải là số nguyên").min(0, "Giá không được âm"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export const updateMilkTypeSchema = createMilkTypeSchema.partial();

export type CreateMilkTypeInput = z.infer<typeof createMilkTypeSchema>;
export type UpdateMilkTypeInput = z.infer<typeof updateMilkTypeSchema>;
