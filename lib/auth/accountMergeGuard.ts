import type { Prisma } from "@prisma/client";
import { AccountError } from "@/lib/auth/accountError";
/** Serialize customer writes and reject retained aliases; fulfillment may explicitly allow blocked customers. */
export async function claimActiveCustomerForWrite(
  tx: Pick<Prisma.TransactionClient, "user">, userId: string, options: { allowBlocked?: boolean } = {},
): Promise<void> {
  const claimed = await tx.user.updateMany({
    where: { id: userId, role: "CUSTOMER", ...(options.allowBlocked ? {} : { is_blocked: false }), sourceMerge: { is: null } },
    data: { updated_at: new Date() },
  });
  if (claimed.count !== 1) throw new AccountError("ACCOUNT_NOT_ACTIVE");
  const current = await tx.user.findUnique({ where: { id: userId }, select: { role: true, is_blocked: true, sourceMerge: { select: { target_user_id: true } } } });
  if (!current || current.role !== "CUSTOMER" || (!options.allowBlocked && current.is_blocked) || current.sourceMerge) throw new AccountError("ACCOUNT_NOT_ACTIVE");
}
/** Follow retained merge aliases for read-only customer QR lookup, with bounded cycle protection. */
export async function resolveCanonicalCustomerId(tx: Pick<Prisma.TransactionClient, "accountMerge">, userId: string): Promise<string> {
  const seen = new Set<string>();
  let current = userId;
  for (let depth = 0; depth < 32; depth++) {
    if (seen.has(current)) throw new AccountError("ACCOUNT_MERGE_CYCLE");
    seen.add(current);
    const alias = await tx.accountMerge.findUnique({ where: { source_user_id: current }, select: { target_user_id: true } });
    if (!alias) return current;
    current = alias.target_user_id;
  }
  throw new AccountError("ACCOUNT_MERGE_CYCLE");
}