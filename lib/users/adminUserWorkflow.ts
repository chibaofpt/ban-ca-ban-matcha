import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { runSerializableTransaction } from "@/lib/serializableTransaction";

const MAX_INT = 2_147_483_647;

export class AdminUserWorkflowError extends Error {
  constructor(public readonly reason: "NOT_FOUND" | "BUSINESS_RULE_VIOLATION" | "RESET_NOT_ALLOWED") {
    super(reason === "NOT_FOUND"
      ? "Customer not found"
      : reason === "RESET_NOT_ALLOWED"
        ? "Password reset is not available for an unregistered customer"
        : "Points balance would overflow");
  }
}

async function requireCustomerId(db: typeof prisma, userQrToken: string): Promise<string> {
  const user = await db.user.findFirst({
    where: { qr_token: userQrToken, role: "CUSTOMER", sourceMerge: { is: null } },
    select: { id: true },
  });
  if (!user) throw new AdminUserWorkflowError("NOT_FOUND");
  return user.id;
}

/** Applies an Admin verification flag to a CUSTOMER selected by public QR token. */
export async function setAdminUserVerified(userQrToken: string, isVerified: boolean): Promise<void> {
  const userId = await requireCustomerId(prisma, userQrToken);
  await prisma.user.update({ where: { id: userId, sourceMerge: { is: null } }, data: { is_verified: isVerified } });
}

/** Applies an Admin block flag and revokes all sessions when blocking a CUSTOMER. */
export async function setAdminUserBlocked(userQrToken: string, isBlocked: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const userId = await requireCustomerId(tx as typeof prisma, userQrToken);
    await tx.user.update({ where: { id: userId, sourceMerge: { is: null } }, data: { is_blocked: isBlocked } });
    if (isBlocked) await tx.session.deleteMany({ where: { user_id: userId } });
  });
}

/** Replaces a CUSTOMER password and revokes all sessions, returning the one-time password. */
export async function resetAdminUserPassword(userQrToken: string): Promise<string> {
  const temporaryPassword = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: { qr_token: userQrToken, role: "CUSTOMER", sourceMerge: { is: null } },
      select: { id: true, password_hash: true },
    });
    if (!user) throw new AdminUserWorkflowError("NOT_FOUND");
    if (!user.password_hash?.trim() || user.password_hash === "GHOST_USER_NO_PASSWORD") {
      throw new AdminUserWorkflowError("RESET_NOT_ALLOWED");
    }
    await tx.user.update({ where: { id: user.id, sourceMerge: { is: null }, password_hash: user.password_hash }, data: { password_hash: passwordHash } });
    await tx.session.deleteMany({ where: { user_id: user.id } });
  });
  return temporaryPassword;
}

/** Atomically gifts points and appends the immutable Admin audit log in one transaction. */
export async function giftAdminUserPoints(userQrToken: string, points: number, adminId: string): Promise<number> {
  return runSerializableTransaction(prisma, async (tx) => {
    const userId = await requireCustomerId(tx as typeof prisma, userQrToken);
    await claimActiveCustomerForWrite(tx, userId);
    const updated = await tx.user.updateMany({
      where: { id: userId, role: "CUSTOMER", points_balance: { lte: MAX_INT - points } },
      data: { points_balance: { increment: points } },
    });
    if (updated.count !== 1) throw new AdminUserWorkflowError("BUSINESS_RULE_VIOLATION");
    await tx.pointsLog.create({ data: {
      user_id: userId, delta: points, reason: "manual_admin_adjustment", performed_by: adminId,
    } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { points_balance: true } });
    return user.points_balance;
  });
}
