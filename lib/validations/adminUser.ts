import { z } from "zod";
import type {
  AdminUserListQuery,
  AdminUserPageQuery,
  AdminUserPatch,
  AdminUserPointsInput,
  AdminUserVoucherPackageQuery,
} from "@/contracts/admin/user";

const pageSchema = z.coerce.number().int().min(1).max(10_000);

export const adminUserListQuerySchema: z.ZodType<AdminUserListQuery> = z.object({
  page: pageSchema.default(1),
  q: z.string().trim().max(50).optional(),
}).strict();

export const adminUserPageQuerySchema: z.ZodType<AdminUserPageQuery> = z.object({ page: pageSchema.default(1) }).strict();

export const adminUserPatchSchema: z.ZodType<AdminUserPatch> = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), is_verified: z.boolean() }).strict(),
  z.object({ action: z.literal("block"), is_blocked: z.boolean() }).strict(),
  z.object({ action: z.literal("reset_password") }).strict(),
]);

export const adminUserPointsSchema: z.ZodType<AdminUserPointsInput> = z.object({ points: z.number().int().min(1).max(100) }).strict();

export const adminUserVoucherPackageQuerySchema: z.ZodType<AdminUserVoucherPackageQuery> = z.object({
  page: pageSchema.default(1),
  category: z.enum(["ALL", "DISCOUNT", "GIFT", "SHIPPING"]).default("ALL"),
}).strict();
