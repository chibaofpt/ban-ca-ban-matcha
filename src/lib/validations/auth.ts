import { z } from "zod";

/** Frontend phone validation — format check only, normalization happens on the server */
const phoneSchema = z
  .string()
  .min(1, "Vui lòng nhập số điện thoại")
  .regex(/^(0|\+84)\d{9}$/, "Số điện thoại không hợp lệ");

export const loginFormSchema = z.object({
  phone_number: phoneSchema,
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
});

export const registerFormSchema = z.object({
  name: z.string().min(1, "Họ và tên không được để trống").max(50, "Họ và tên không được vượt quá 50 ký tự"),
  phone_number: phoneSchema,
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(72, "Mật khẩu quá dài"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type RegisterFormValues = z.infer<typeof registerFormSchema>;
