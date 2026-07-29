import { z } from "zod";

/** Frontend phone validation — format check only, normalization happens on the server */
const phoneSchema = z
  .string()
  .min(1, "Vui lòng nhập số điện thoại")
  .regex(/^(0|\+84)\d{9}$/, "Số điện thoại không hợp lệ");

const instagramSchema = z
  .string()
  .transform((value) => value.trim().replace(/^@/, "").toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "Vui lòng nhập số điện thoại hoặc Instagram")
      .max(30, "Tên Instagram không được vượt quá 30 ký tự")
      .regex(
        /^[a-z0-9._]+$/,
        "Tên Instagram chỉ gồm chữ, số, dấu chấm và gạch dưới",
      ),
  );

export const loginFormSchema = z.object({
  identifier: z.string().min(1, "Vui lòng nhập số điện thoại hoặc Instagram"),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

export const registerFormSchema = z.object({
  name: z.string().min(1, "Họ và tên không được để trống").max(50, "Họ và tên không được vượt quá 50 ký tự"),
  phone_number: phoneSchema,
  insta_name: z
    .union([instagramSchema, z.literal("")])
    .optional(),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(72, "Mật khẩu quá dài"),
});

export const profileEditFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Họ và tên không được để trống")
    .max(50, "Họ và tên không được vượt quá 50 ký tự"),
  insta_name: z
    .string()
    .max(31, "Tên Instagram không được vượt quá 30 ký tự")
    .refine((value) => {
      const normalized = value.trim().replace(/^@/, "").toLowerCase();
      return normalized === "" || /^[a-z0-9._]{1,30}$/.test(normalized);
    }, "Tên Instagram chỉ gồm chữ, số, dấu chấm và gạch dưới"),
  current_password: z
    .string()
    .max(72, "Mật khẩu quá dài"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
export type ProfileEditFormValues = z.infer<typeof profileEditFormSchema>;
