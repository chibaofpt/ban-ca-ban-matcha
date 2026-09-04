import { z } from "zod";
import { imageFilenameSchema } from "@/lib/validations/menu";



export const addonOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
  image_key: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
  label: z.string().min(1, "Vui lòng nhập tên option").max(100),
  price_vnd: z.coerce.number().int().min(0),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
  gram_value: z.coerce.number().positive().nullable().optional(),
});

export const createAddonGroupSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên nhóm").max(100),
  description: z.string().max(500).optional().nullable(),
  image_filename: imageFilenameSchema,
  max_select: z.coerce.number().int().min(1),
  is_dynamic_gram: z.boolean().default(false),
  is_active: z.boolean().default(true),
  options: z.array(addonOptionInputSchema).min(1, "Phải có ít nhất 1 option"),
}).superRefine((data, ctx) => {
  const imageKeys = data.options
    .map((option) => option.image_key)
    .filter((key): key is string => Boolean(key));
  if (new Set(imageKeys).size !== imageKeys.length) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "image_key của option không được trùng" });
  }
  const activeOptions = data.options.filter((option) => option.is_active);
  if (data.is_active && activeOptions.length === 0) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Nhóm đang mở bán phải có ít nhất 1 option active" });
  }

  if (data.is_dynamic_gram) {
    if (data.max_select !== 1) {
      ctx.addIssue({ code: "custom", path: ["max_select"], message: "Nhóm giá theo gram bột chỉ cho phép chọn 1 option" });
    }
    if (activeOptions.some((o) => !o.gram_value || o.gram_value <= 0 || o.price_vnd !== 0)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Option gram động phải có gram_value > 0 và price_vnd = 0" });
    }
  } else {
    if (activeOptions.some((o) => o.gram_value != null)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Không được set gram_value cho nhóm giá cố định" });
    }
  }
});

export const updateAddonGroupSchema = createAddonGroupSchema;
export type AddonOptionInput = z.infer<typeof addonOptionInputSchema>;
export type CreateAddonGroupInput = z.infer<typeof createAddonGroupSchema>;
export type UpdateAddonGroupInput = z.infer<typeof updateAddonGroupSchema>;
