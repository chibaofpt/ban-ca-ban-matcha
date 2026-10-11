import { z } from "zod";
import { normalizePhone } from "@/src/utils/phone";
import { PasswordSchema } from "@/lib/validations/auth";
const token = z.string().min(1).max(2048);
export const GoogleChallengeSchema = z.union([
  z.object({ purpose: z.enum(["LOGIN", "CLAIM"]), turnstile_token: token.optional(), current_password: PasswordSchema.optional() }).strict(),
  z.object({ purpose: z.enum(["LINK", "REAUTH"]), turnstile_token: token, current_password: PasswordSchema.optional() }).strict(),
]);
export const GoogleCredentialSchema = z.object({
  challenge_id: z.union([z.string().uuid(), z.string().max(2048).regex(/^(login|claim)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)]),
  credential: z.string().min(1).max(16384), turnstile_token: token.optional(),
}).strict().refine(input => !(input.challenge_id.startsWith("login.") || input.challenge_id.startsWith("claim.")) || Boolean(input.turnstile_token), {
  path: ["turnstile_token"], message: "Vui lòng hoàn tất xác minh bảo mật",
});
export const ClaimContextSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export const ClaimPasswordSchema = z.object({ password: PasswordSchema, password_confirmation: PasswordSchema, turnstile_token: token }).strict()
  .refine(input => input.password === input.password_confirmation, { path: ["password_confirmation"], message: "Mật khẩu xác nhận chưa khớp" });
export const PhoneUpdateSchema = z.object({ phone_number: z.string().transform(normalizePhone).pipe(z.string().regex(/^\+84\d{9}$/)) }).strict();
export const PhoneOtpRequestSchema = PhoneUpdateSchema.extend({ request_id: z.string().uuid(), turnstile_token: token });
export const PhoneOtpConfirmSchema = PhoneUpdateSchema.extend({ challenge_id: z.string().uuid(), otp: z.string().regex(/^\d{6}$/) });
