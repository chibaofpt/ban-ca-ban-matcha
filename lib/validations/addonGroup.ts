import { z } from "zod";
import { imageFilenameSchema } from "@/lib/validations/menu";

export const addonTypeEnum = z.enum(["SELECTOR", "TOGGLE", "QUANTITY"]);

export const addonOptionInputSchema = z.object({
  id: z.string().uuid().optional(),
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
  type: addonTypeEnum,
  max_quantity: z.coerce.number().int().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
  options: z.array(addonOptionInputSchema).min(1, "Phải có ít nhất 1 option"),
}).superRefine((data, ctx) => {
  const activeOptions = data.options.filter((option) => option.is_active);
  if (data.is_active && activeOptions.length === 0) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Nhóm đang mở bán phải có ít nhất 1 option active" });
  }
  if ((data.type === "TOGGLE" || data.type === "QUANTITY") && activeOptions.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["options"], message: `${data.type} phải có đúng 1 option active` });
  }
  if (data.type === "QUANTITY" && data.max_quantity == null) {
    ctx.addIssue({ code: "custom", path: ["max_quantity"], message: "QUANTITY phải có số lượng tối đa" });
  }
  if (data.type !== "QUANTITY" && data.max_quantity != null) {
    ctx.addIssue({ code: "custom", path: ["max_quantity"], message: "Chỉ QUANTITY được có số lượng tối đa" });
  }

  const dynamicOptions = activeOptions.filter((option) => option.gram_value != null);
  if (dynamicOptions.length > 0) {
    if (data.type !== "SELECTOR" || dynamicOptions.length !== activeOptions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Option gram động phải nằm trong SELECTOR và không được trộn với giá cố định",
      });
    }
    if (dynamicOptions.some((option) => option.price_vnd !== 0)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Option gram động phải có price_vnd = 0" });
    }
  }
});

export const updateAddonGroupSchema = createAddonGroupSchema;

export type AddonType = z.infer<typeof addonTypeEnum>;
export type AddonOptionInput = z.infer<typeof addonOptionInputSchema>;
export type CreateAddonGroupInput = z.infer<typeof createAddonGroupSchema>;
export type UpdateAddonGroupInput = z.infer<typeof updateAddonGroupSchema>;
