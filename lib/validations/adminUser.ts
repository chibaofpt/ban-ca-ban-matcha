import { z } from "zod";

const pageSchema = z.coerce.number().int().min(1).max(10_000);

export const adminUserListQuerySchema = z.object({
  page: pageSchema.default(1),
  q: z.string().trim().max(50).optional(),
}).strict();

export const adminUserPageQuerySchema = z.object({ page: pageSchema.default(1) }).strict();

export const adminUserPatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), is_verified: z.boolean() }).strict(),
  z.object({ action: z.literal("block"), is_blocked: z.boolean() }).strict(),
  z.object({ action: z.literal("reset_password") }).strict(),
]);

export const adminUserPointsSchema = z.object({ points: z.number().int().min(1).max(100) }).strict();

export const adminUserVoucherPackageQuerySchema = z.object({
  page: pageSchema.default(1),
  category: z.enum(["ALL", "DISCOUNT", "GIFT", "SHIPPING"]).default("ALL"),
}).strict();
