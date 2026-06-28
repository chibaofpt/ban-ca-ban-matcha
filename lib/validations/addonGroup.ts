import { z } from "zod";

export const addonTypeEnum = z.enum(["SELECTOR", "TOGGLE", "QUANTITY"]);

export const addonOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1, "Vui lòng nhập tên option").max(100),
  price_vnd: z.coerce.number().int().min(0),
  is_default: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
  gram_value: z.coerce.number().nullable().optional(),
});

export const createAddonGroupSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên nhóm").max(100),
  description: z.string().max(500).optional().nullable(),
  type: addonTypeEnum,
  is_required: z.boolean().default(false),
  min_quantity: z.coerce.number().int().min(0).nullable().optional(),
  max_quantity: z.coerce.number().int().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
  options: z.array(addonOptionInputSchema).min(1, "Phải có ít nhất 1 option"),
});

export const updateAddonGroupSchema = createAddonGroupSchema.partial();

export type AddonType = z.infer<typeof addonTypeEnum>;
export type AddonOptionInput = z.infer<typeof addonOptionInputSchema>;
export type CreateAddonGroupInput = z.infer<typeof createAddonGroupSchema>;
export type UpdateAddonGroupInput = z.infer<typeof updateAddonGroupSchema>;
