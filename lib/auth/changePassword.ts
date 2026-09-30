import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { cacheDelete } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const BCRYPT_COST = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ChangePasswordCommand {
  userId: string;
  sessionId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResult {
  refreshToken: string;
  revokedRefreshTokens: string[];
}

/** Indicates that the supplied current password does not match the account. */
export class CurrentPasswordMismatchError extends Error {
  constructor() {
    super("Current password is invalid");
    this.name = "CurrentPasswordMismatchError";
  }
}

/** Indicates that the new password is the same as the current password. */
export class PasswordReuseError extends Error {
  constructor() {
    super("New password must differ from the current password");
    this.name = "PasswordReuseError";
  }
}

/** Indicates that a conditional password or session update lost a race. */
export class ChangePasswordConflictError extends Error {
  constructor() {
    super("Password change conflict");
    this.name = "ChangePasswordConflictError";
  }
}

/** Changes a customer's password and rotates only the authenticated session. */
export async function changePassword(
  command: ChangePasswordCommand,
): Promise<ChangePasswordResult> {
  const currentUser = await prisma.user.findUnique({
    where: { id: command.userId },
    select: { password_hash: true },
  });
  if (!currentUser) throw new CurrentPasswordMismatchError();

  const currentMatches = await bcrypt.compare(command.currentPassword, currentUser.password_hash);
  if (!currentMatches) throw new CurrentPasswordMismatchError();

  const reusesCurrentPassword = await bcrypt.compare(command.newPassword, currentUser.password_hash);
  if (reusesCurrentPassword) throw new PasswordReuseError();

  const passwordHash = await bcrypt.hash(command.newPassword, BCRYPT_COST);
  const now = new Date();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updatedUser = await tx.user.updateMany({
      where: { id: command.userId, password_hash: currentUser.password_hash },
      data: { password_hash: passwordHash },
    });
    if (updatedUser.count !== 1) throw new ChangePasswordConflictError();

    const currentSession = await tx.session.findUnique({
      where: { id: command.sessionId },
      select: {
        user_id: true,
        refresh_token: true,
        previous_refresh_token: true,
        expires_at: true,
      },
    });
    if (
      !currentSession ||
      currentSession.user_id !== command.userId ||
      currentSession.expires_at <= now
    ) {
      throw new ChangePasswordConflictError();
    }

    const otherSessions = await tx.session.findMany({
      where: { user_id: command.userId, id: { not: command.sessionId } },
      select: { refresh_token: true, previous_refresh_token: true },
    });
    await tx.session.deleteMany({
      where: { user_id: command.userId, id: { not: command.sessionId } },
    });

    const nextRefreshToken = randomUUID();
    const rotated = await tx.session.updateMany({
      where: {
        id: command.sessionId,
        user_id: command.userId,
        refresh_token: currentSession.refresh_token,
        expires_at: { gt: now },
      },
      data: {
        refresh_token: nextRefreshToken,
        previous_refresh_token: currentSession.refresh_token,
        rotating_at: now,
        expires_at: new Date(now.getTime() + REFRESH_TTL_MS),
      },
    });
    if (rotated.count !== 1) throw new ChangePasswordConflictError();

    const revokedRefreshTokens = new Set<string>([
      currentSession.refresh_token,
      ...(currentSession.previous_refresh_token ? [currentSession.previous_refresh_token] : []),
      ...otherSessions.flatMap((session) => [
        session.refresh_token,
        ...(session.previous_refresh_token ? [session.previous_refresh_token] : []),
      ]),
    ]);
    return {
      refreshToken: nextRefreshToken,
      revokedRefreshTokens: [...revokedRefreshTokens],
    };
  });

  await evictLegacySessionCaches(result.revokedRefreshTokens);
  return result;
}

async function evictLegacySessionCaches(refreshTokens: string[]): Promise<void> {
  if (refreshTokens.length === 0) return;
  try {
    await cacheDelete(...refreshTokens.map((token) => `session:${token}`));
  } catch {
    // PostgreSQL remains authoritative; legacy Redis eviction is best effort.
  }
}
