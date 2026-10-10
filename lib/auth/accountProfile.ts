import bcrypt from "bcryptjs";
import type { AuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountTransaction } from "@/lib/auth/accountTransaction";
import { accountProfile, loadAccount, requireActiveAccount } from "@/lib/auth/accountData";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { requireActorSession } from "@/lib/auth/googleChallenge";
import { consumeGoogleReauth } from "@/lib/auth/googleReauth";
import { AccountError } from "@/lib/auth/accountError";
import type { UpdateProfileInput } from "@/lib/validations/profile";
/** Read public profile capabilities from the live unmerged customer. */
export async function getAccountProfile(userId: string) {
  const user = await loadAccount(prisma, userId);
  requireActiveAccount(user);
  return accountProfile(user);
}
/** Update public profile fields after fresh proof when the Instagram alias changes. */
export async function updateAccountProfile(req: Request, session: AuthSession, input: UpdateProfileInput) {
  if (!session.session_id) throw new AccountError("ACCOUNT_SESSION_EXPIRED", 401, "UNAUTHORIZED");
  return accountTransaction(async tx => {
    await requireActorSession(tx, session.id, session.session_id!);
    await claimActiveCustomerForWrite(tx, session.id);
    const user = await loadAccount(tx, session.id);
    requireActiveAccount(user);
    const instagramChanged = input.insta_name !== undefined && input.insta_name !== user.insta_name;
    if (instagramChanged) {
      if (input.reauth_proof) {
        await consumeGoogleReauth(tx, req, input.reauth_proof, user.id, session.session_id!, user.google_sub);
      } else if (user.password_hash && user.password_hash !== "GHOST_USER_NO_PASSWORD") {
        if (!input.current_password) throw new AccountError("CURRENT_PASSWORD_REQUIRED", 400, "VALIDATION_ERROR");
        if (!await bcrypt.compare(input.current_password, user.password_hash)) throw new AccountError("CURRENT_PASSWORD_INVALID", 400, "VALIDATION_ERROR");
      } else {
        throw new AccountError("GOOGLE_REAUTH_REQUIRED", 400, "VALIDATION_ERROR");
      }
    }
    const data: { name?: string; insta_name?: string | null } = {};
    if (input.name !== undefined && input.name !== user.name) data.name = input.name;
    if (instagramChanged) data.insta_name = input.insta_name;
    if (!Object.keys(data).length) return accountProfile(user);
    await tx.user.update({ where: { id: user.id }, data });
    return accountProfile(await loadAccount(tx, user.id));
  });
}
