import type { Prisma } from "@prisma/client";
import { AccountError } from "@/lib/auth/accountError";
import { type AccountRecord, loadAccount, requireActiveAccount, requireClaimableGhost, requireEmailGhost } from "@/lib/auth/accountData";
import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { revokeAccountSessions } from "@/lib/auth/accountSession";
export interface AccountMergeProof { kind: "PHONE_OTP" | "GOOGLE_EMAIL" | "GOOGLE_CLAIM"; reference: string; actorId: string | null; }
/** Consolidate customer history into the legacy identity without altering financial snapshots or ledger events. */
export async function mergeAccounts(tx: Prisma.TransactionClient, sourceId: string, targetId: string, proof: AccountMergeProof, sourceIsGhost = false): Promise<{ user: AccountRecord; revoked: string[] }> {
  if (sourceId === targetId) throw new AccountError("ACCOUNT_MERGE_INVALID");
  for (const id of [sourceId, targetId].sort()) await claimActiveCustomerForWrite(tx, id);
  const source = await loadAccount(tx, sourceId);
  const target = await loadAccount(tx, targetId);
  requireActiveAccount(source); requireActiveAccount(target);
  if (sourceIsGhost) requireEmailGhost(source);
  else { requireClaimableGhost(target); if (source.account_origin !== "GOOGLE_EMAIL" || !source.google_sub) throw new AccountError("ACCOUNT_MERGE_INVALID"); }
  if (target.account_origin !== "LEGACY_PHONE" || !target.phone_number) throw new AccountError("ACCOUNT_MERGE_INVALID");
  const total = source.points_balance + target.points_balance;
  if (!Number.isSafeInteger(total) || total < 0 || total > 2147483647) throw new AccountError("ACCOUNT_POINTS_OVERFLOW");
  const rewards = await tx.welcomeReward.findMany({ where: { user_id: { in: [sourceId, targetId] } }, select: { id: true, user_id: true } });
  const sourceReward = rewards.find(row => row.user_id === sourceId);
  const targetReward = rewards.find(row => row.user_id === targetId);
  const addresses = await tx.address.findMany({ where: { user_id: { in: [sourceId, targetId] } }, orderBy: [{ created_at: "asc" }, { id: "asc" }], select: { id: true, user_id: true, is_default: true } });
  const preferred = addresses.find(row => row.user_id === (sourceIsGhost ? targetId : sourceId) && row.is_default)
    ?? addresses.find(row => row.user_id === (sourceIsGhost ? sourceId : targetId) && row.is_default);
  const grants = await tx.voucherGrant.findMany({ where: { user_id: { in: [sourceId, targetId] } }, select: { id: true, user_id: true, package_id: true } });
  const targetPackages = new Set(grants.filter(row => row.user_id === targetId).map(row => row.package_id));
  const moveGrants = grants.filter(row => row.user_id === sourceId && !targetPackages.has(row.package_id));
  const subscriptions = await tx.pushSubscription.findMany({ where: { user_id: { in: [sourceId, targetId] } }, select: { id: true, user_id: true, endpoint: true, is_active: true } });
  for (const row of subscriptions.filter(row => row.user_id === sourceId)) {
    const duplicate = subscriptions.find(other => other.user_id === targetId && other.endpoint === row.endpoint);
    if (duplicate) {
      await tx.pushSubscription.update({ where: { id: duplicate.id }, data: { is_active: duplicate.is_active && row.is_active } });
      await tx.pushSubscription.delete({ where: { id: row.id } });
    } else await tx.pushSubscription.update({ where: { id: row.id }, data: { user_id: targetId } });
  }
  // Clear unique identity fields before transferring them to the retained canonical row.
  await tx.user.update({ where: { id: sourceId }, data: { points_balance: 0, password_hash: null, google_sub: null, email: null, insta_name: null, phone_number: null } });
  await tx.user.update({ where: { id: targetId }, data: { points_balance: total,
    name: sourceIsGhost ? target.name : source.name || target.name,
    insta_name: sourceIsGhost ? target.insta_name || source.insta_name : source.insta_name || target.insta_name,
    email: sourceIsGhost ? source.email || target.email : source.email,
    google_sub: sourceIsGhost ? target.google_sub : source.google_sub, is_verified: true } });
  await tx.order.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
  await tx.pointsLog.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
  await tx.voucher.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
  if (moveGrants.length) await tx.voucherGrant.updateMany({ where: { id: { in: moveGrants.map(row => row.id) } }, data: { user_id: targetId } });
  await tx.address.updateMany({ where: { user_id: { in: [sourceId, targetId] } }, data: { is_default: false } });
  await tx.address.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
  if (preferred) await tx.address.update({ where: { id: preferred.id }, data: { is_default: true } });
  if (sourceReward && !targetReward) {
    await tx.welcomeReward.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
    await tx.rewardOutcome.updateMany({ where: { user_id: sourceId }, data: { user_id: targetId } });
  }
  await tx.accountMerge.create({ data: { source_user_id: sourceId, target_user_id: targetId, proof_kind: proof.kind,
    proof_reference: proof.reference, performed_by: proof.actorId, audit: { source_points: source.points_balance, target_points: target.points_balance,
      merged_points: total, source_welcome_reward_id: sourceReward?.id ?? null, target_welcome_reward_id: targetReward?.id ?? null,
      welcome_reward_action: sourceReward ? targetReward ? "RETAIN_SOURCE_AUDIT" : "TRANSFER_SOURCE" : targetReward ? "RETAIN_TARGET" : "NONE",
      retained_grant_ids: grants.filter(row => row.user_id === sourceId && targetPackages.has(row.package_id)).map(row => row.id) } } });
  const revoked = await revokeAccountSessions(tx, [sourceId, targetId]);
  return { user: await loadAccount(tx, targetId), revoked };
}