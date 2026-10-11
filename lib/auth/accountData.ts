import type { Prisma } from "@prisma/client";
import { canClaimLegacyGhost, canSetInitialPassword, isRegisteredAccount } from "@/lib/auth/accountIdentityPolicy";
import { AccountError } from "@/lib/auth/accountError";
export const ACCOUNT_INCLUDE = {
  sourceMerge: { select: { target_user_id: true } },
  pointsLogs: { where: { delta: { gt: 0 } }, take: 1, select: { id: true } },
  vouchers: { take: 1, select: { id: true } },
} as const satisfies Prisma.UserInclude;
export type AccountRecord = Prisma.UserGetPayload<{ include: typeof ACCOUNT_INCLUDE }>;
/** Read the canonical account and the immutable evidence required to claim a legacy ghost. */
export async function loadAccount(tx: Pick<Prisma.TransactionClient, "user">, id: string): Promise<AccountRecord> {
  const user = await tx.user.findUnique({ where: { id }, include: ACCOUNT_INCLUDE });
  if (!user) throw new AccountError("ACCOUNT_NOT_FOUND", 404, "NOT_FOUND");
  return user;
}
/** Adapt the persisted account to the shared pure identity policy. */
export function accountIdentity(user: AccountRecord) { return { ...user, merged: Boolean(user.sourceMerge) }; }
/** Require a legacy ghost with earned points history or owned vouchers. */
export function requireClaimableGhost(user: AccountRecord): void {
  if (!canClaimLegacyGhost(accountIdentity(user), { hasEarnedPoints: user.pointsLogs.length > 0, hasVouchers: user.vouchers.length > 0 })) {
    throw new AccountError("ACCOUNT_NOT_CLAIMABLE");
  }
}
/** Require an active email-origin loyalty identity with no login credential. */
export function requireEmailGhost(user: AccountRecord): void {
  requireActiveAccount(user);
  if (user.account_origin !== "GOOGLE_EMAIL" || !user.email || isRegisteredAccount(accountIdentity(user))) {
    throw new AccountError("ACCOUNT_NOT_CLAIMABLE");
  }
}
/** Return only public identity and capability fields. */
export function accountProfile(user: AccountRecord) {
  return { name: user.name, phone_number: user.phone_number, email: user.email, insta_name: user.insta_name,
    points_balance: user.points_balance, qr_token: user.qr_token, google_connected: Boolean(user.google_sub),
    has_password: isRegisteredAccount({ ...accountIdentity(user), google_sub: null }),
    can_set_password: canSetInitialPassword(accountIdentity(user)) };
}
/** Reject blocked, merged and noncustomer identities before a customer authentication write. */
export function requireActiveAccount(user: AccountRecord): void {
  if (user.role !== "CUSTOMER" || user.is_blocked || user.sourceMerge) throw new AccountError("ACCOUNT_NOT_ACTIVE", 403, "FORBIDDEN");
}