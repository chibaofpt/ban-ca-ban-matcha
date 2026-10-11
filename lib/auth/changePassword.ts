import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { cacheDelete } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { consumeGoogleReauth } from "@/lib/auth/googleReauth";
import { canSetInitialPassword } from "@/lib/auth/accountIdentityPolicy";
import { AccountError } from "@/lib/auth/accountError";
const BCRYPT_COST = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export interface ChangePasswordCommand {
  userId: string; sessionId: string; currentPassword?: string; newPassword: string;
  request?: Request; reauthProof?: string;
}
export interface ChangePasswordResult { refreshToken: string; revokedRefreshTokens: string[]; }
/** Indicates that the supplied current password does not match the account. */
export class CurrentPasswordMismatchError extends Error {
  constructor() { super("Current password is invalid"); this.name = "CurrentPasswordMismatchError"; }
}
/** Indicates that the new password is the same as the current password. */
export class PasswordReuseError extends Error {
  constructor() { super("New password must differ from the current password"); this.name = "PasswordReuseError"; }
}
/** Indicates that a conditional password or session update lost a race. */
export class ChangePasswordConflictError extends Error {
  constructor() { super("Password change conflict"); this.name = "ChangePasswordConflictError"; }
}
/** Change a legacy password or create its first password using fresh Google reauthentication. */
export async function changePassword(command: ChangePasswordCommand): Promise<ChangePasswordResult> {
  const currentUser = await prisma.user.findUnique({
    where: { id: command.userId },
    select: { password_hash: true, account_origin: true, google_sub: true, phone_number: true,
      role: true, is_blocked: true, sourceMerge: { select: { target_user_id: true } } },
  });
  if (!currentUser) throw new CurrentPasswordMismatchError();
  const initial = !currentUser.password_hash || currentUser.password_hash === "GHOST_USER_NO_PASSWORD";
  if (currentUser.account_origin !== "LEGACY_PHONE") throw new AccountError("PASSWORD_SETUP_NOT_ALLOWED");
  if (initial) {
    if (!canSetInitialPassword({ ...currentUser, merged: Boolean(currentUser.sourceMerge) })) throw new AccountError("PASSWORD_SETUP_NOT_ALLOWED");
    if (!command.request || !command.reauthProof) throw new AccountError("GOOGLE_REAUTH_REQUIRED", 400, "VALIDATION_ERROR");
  } else {
    if (!await bcrypt.compare(command.currentPassword ?? "", currentUser.password_hash!)) throw new CurrentPasswordMismatchError();
    if (await bcrypt.compare(command.newPassword, currentUser.password_hash!)) throw new PasswordReuseError();
  }
  const passwordHash = await bcrypt.hash(command.newPassword, BCRYPT_COST);
  const now = new Date();
  const result = await accountTransaction(async tx => {
    await claimActiveCustomerForWrite(tx, command.userId);
    if (initial) await consumeGoogleReauth(tx, command.request!, command.reauthProof, command.userId, command.sessionId, currentUser.google_sub);
    const updated = await tx.user.updateMany({
      where: { id: command.userId, password_hash: currentUser.password_hash, account_origin: "LEGACY_PHONE", is_blocked: false, sourceMerge: { is: null } },
      data: { password_hash: passwordHash },
    });
    if (updated.count !== 1) throw new ChangePasswordConflictError();
    await tx.googleAuthAttempt.updateMany({
      where: { actor_user_id: command.userId, purpose: { in: ["LINK", "REAUTH"] }, consumed_at: null },
      data: { consumed_at: now },
    });
    const currentSession = await tx.session.findUnique({
      where: { id: command.sessionId },
      select: { user_id: true, refresh_token: true, previous_refresh_token: true, expires_at: true },
    });
    if (!currentSession || currentSession.user_id !== command.userId || currentSession.expires_at <= now) throw new ChangePasswordConflictError();
    const otherSessions = await tx.session.findMany({
      where: { user_id: command.userId, id: { not: command.sessionId } },
      select: { refresh_token: true, previous_refresh_token: true },
    });
    await tx.session.deleteMany({ where: { user_id: command.userId, id: { not: command.sessionId } } });
    const nextRefreshToken = randomUUID();
    const rotated = await tx.session.updateMany({
      where: { id: command.sessionId, user_id: command.userId, refresh_token: currentSession.refresh_token, expires_at: { gt: now } },
      data: { refresh_token: nextRefreshToken, previous_refresh_token: currentSession.refresh_token, rotating_at: now, expires_at: new Date(now.getTime() + REFRESH_TTL_MS) },
    });
    if (rotated.count !== 1) throw new ChangePasswordConflictError();
    return { refreshToken: nextRefreshToken, revokedRefreshTokens: [...new Set([
      currentSession.refresh_token, ...(currentSession.previous_refresh_token ? [currentSession.previous_refresh_token] : []),
      ...otherSessions.flatMap(row => [row.refresh_token, ...(row.previous_refresh_token ? [row.previous_refresh_token] : [])]),
    ])] };
  });
  await cacheDelete(...result.revokedRefreshTokens.map(token => `session:${token}`)).catch(() => undefined);
  return result;
}
