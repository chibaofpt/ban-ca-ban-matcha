import { z } from "zod";

const powderTypeEnum = z.enum(["RECOMMEND", "NEW", "SEASONAL", "NONE"]);
const sizeEnum = z.enum(["SMALL", "MEDIUM", "LARGE"]);

const sizeConfigSchema = z.object({
  size: sizeEnum,
  grams: z.number().positive(),
});

export const createPowderSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên bột").max(100, "Tên bột không được vượt quá 100 ký tự"),
  manufacturer: z.string().min(1, "Vui lòng nhập nhà sản xuất").max(100, "Nhà sản xuất không được vượt quá 100 ký tự"),
  description: z.string().max(500, "Mô tả không được vượt quá 500 ký tự").optional().nullable(),
  price_per_gram: z.number().int("Giá phải là số nguyên").min(0, "Giá không được âm"),
  type: powderTypeEnum.default("NONE"),
  reference_latte_item_id: z.string().uuid("ID tham chiếu không hợp lệ").optional().nullable(),
  
  // Taste characteristics (1-5)
  fragrance: z.number().int().min(1).max(5).optional().nullable(),
  body: z.number().int().min(1).max(5).optional().nullable(),
  bitterness: z.number().int().min(1).max(5).optional().nullable(),
  umami: z.number().int().min(1).max(5).optional().nullable(),
  color: z.number().int().min(1).max(5).optional().nullable(),
  
  is_available: z.boolean().default(true),
  
  // Exception config
  size_config: z.array(sizeConfigSchema).max(3).optional(),
});

export const updatePowderSchema = createPowderSchema.partial();

export type CreatePowderInput = z.infer<typeof createPowderSchema>;
export type UpdatePowderInput = z.infer<typeof updatePowderSchema>;
