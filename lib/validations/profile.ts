import { z } from "zod";
import { InstagramUsernameSchema } from "@/lib/validations/auth";

/** Validates editable customer profile fields. */
export const UpdateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Họ và tên không được để trống")
      .max(50, "Họ và tên không được vượt quá 50 ký tự")
      .optional(),
    insta_name: z.union([InstagramUsernameSchema, z.null()]).optional(),
    current_password: z
      .string()
      .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
      .max(72, "Mật khẩu không được vượt quá 72 ký tự")
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.insta_name !== undefined,
    {
      message: "Không có thông tin nào để cập nhật",
    },
  );

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
