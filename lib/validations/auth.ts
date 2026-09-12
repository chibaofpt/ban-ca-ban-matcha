import { z } from "zod";

const instagramPattern = /^[a-z0-9._]{1,30}$/;

/** Validates the canonical UUID shape used by database refresh tokens. */
export const RefreshTokenSchema = z.string().uuid().max(36);

/** Canonical password policy shared by registration and password changes. */
export const PasswordSchema = z.string()
  .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
  .refine((value) => new TextEncoder().encode(value).length <= 72, {
    message: "Mật khẩu không được vượt quá 72 byte UTF-8",
  });

const currentPasswordSchema = z
  .string()
  .min(6, "Mật khẩu hiện tại phải có ít nhất 6 ký tự")
  .max(72, "Mật khẩu hiện tại không được vượt quá 72 ký tự");

/** Normalize an Instagram username for storage and lookup. */
export function normalizeInstagramUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/** Validates and normalizes an optional Instagram login alias. */
export const InstagramUsernameSchema = z
  .string()
  .transform(normalizeInstagramUsername)
  .pipe(
    z
      .string()
      .min(1, "Tên Instagram không được để trống")
      .max(30, "Tên Instagram không được vượt quá 30 ký tự")
      .regex(
        instagramPattern,
        "Tên Instagram chỉ gồm chữ, số, dấu chấm và gạch dưới",
      ),
  );

/**
 * Step 1 schema: phone number + password.
 */
export const RegisterStep1Schema = z.object({
  phone_number: z
    .string()
    .regex(/^(0|\+84)\d{9}$/, "Số điện thoại không hợp lệ (ví dụ: 0912345678)"),
  password: PasswordSchema,
});

/**
 * Step 2 schema: display name.
 */
export const RegisterStep2Schema = z.object({
  name: z
    .string()
    .min(1, "Họ và tên không được để trống")
    .max(50, "Họ và tên không được vượt quá 50 ký tự"),
});

/**
 * Full schema for user registration input validation (used by the API route).
 */
export const RegisterSchema = RegisterStep1Schema.merge(RegisterStep2Schema);
export const RegisterSchemaWithInstagram = RegisterSchema.extend({
  insta_name: InstagramUsernameSchema.optional(),
});

/** Validates the authenticated customer's password-change request. */
export const ChangePasswordSchema = z
  .object({
    current_password: currentPasswordSchema,
    new_password: PasswordSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.current_password === value.new_password) {
      context.addIssue({
        code: "custom",
        path: ["new_password"],
        message: "Mật khẩu mới phải khác mật khẩu hiện tại",
      });
    }
  });

/**
 * Schema for phone or Instagram login input validation.
 */
export const LoginSchema = z
  .object({
    phone_number: z
      .string()
      .regex(
        /^(0|\+84)\d{9}$/,
        "Số điện thoại không hợp lệ (ví dụ: 0912345678)",
      )
      .optional(),
    insta_name: InstagramUsernameSchema.optional(),
    password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự").max(72, "Mật khẩu không được vượt quá 72 ký tự"),
  })
  .superRefine((value, context) => {
    const identifierCount =
      Number(value.phone_number !== undefined) +
      Number(value.insta_name !== undefined);
    if (identifierCount !== 1) {
      context.addIssue({
        code: "custom",
        message: "Vui lòng nhập số điện thoại hoặc tên Instagram",
        path: ["phone_number"],
      });
    }
  });

export type RegisterStep1Input = z.infer<typeof RegisterStep1Schema>;
export type RegisterStep2Input = z.infer<typeof RegisterStep2Schema>;
export type RegisterInput = z.infer<typeof RegisterSchemaWithInstagram>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
