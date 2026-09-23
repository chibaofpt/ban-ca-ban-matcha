import { z } from "zod";

export const smsTestSendSchema = z.object({
  phone_number: z.string().trim().min(1).max(32),
  request_id: z.string().uuid(),
}).strict();

export const smsTestVerifySchema = z.object({
  challenge_id: z.string().uuid(),
  otp: z.string().regex(/^\d{6}$/),
}).strict();
