import { z } from "zod";

export const smsTestMessageTemplateSchema = z.string().trim().min(1).max(480).refine(
  (value) => value.split("{otp}").length === 2,
  "Message template must contain exactly one {otp} placeholder",
);

export const smsTestSendSchema = z.object({
  phone_number: z.string().trim().min(1).max(32),
  request_id: z.string().uuid(),
  message_template: smsTestMessageTemplateSchema,
}).strict();

export const smsTestVerifySchema = z.object({
  challenge_id: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/),
}).strict();
