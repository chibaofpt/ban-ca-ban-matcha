import { claimActiveCustomerForWrite } from "@/lib/auth/accountMergeGuard";
import { readWelcomeRewardSettings, hasWelcomeCampaignStock, isWelcomeAvailabilityFailure } from "@/lib/rewards/welcomeRewardConfiguration";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { WelcomeRewardSummary } from "@/contracts/reward";
import { issueVoucherInTransaction } from "@/lib/vouchers/voucherIssuance";
import { loadVoucherAvailabilityCatalog } from "@/lib/vouchers/voucherAvailability";
import { selectWeightedReward } from "@/lib/rewards/welcomeRewardSelection";
import {
  WELCOME_REWARD_INCLUDE,
  toWelcomeRewardSummary,
  type WelcomeRewardRecord,
} from "@/lib/rewards/welcomeRewardDto";

type Tx = Prisma.TransactionClient;
export interface WelcomeRewardDatabase {
  $transaction: <T>(
    callback: (tx: Tx) => Promise<T>,
    options: { isolationLevel: "Serializable"; maxWait: number; timeout: number },
  ) => Promise<T>;
}

export class WelcomeRewardError extends Error {
  constructor(public readonly reason: "NOT_FOUND" | "CONFLICT" | "REWARD_PAUSED" | "REWARD_TEMPORARILY_UNAVAILABLE") {
    super(reason);
    this.name = "WelcomeRewardError";
  }
}

async function completeWithPoints(
  tx: Tx,
  input: { rewardId: string; userId: string; points: number; campaignId?: string | null; boxId?: string | null; requestId?: string | null },
): Promise<void> {
  await tx.user.update({ where: { id: input.userId }, data: { points_balance: { increment: input.points } } });
  const log = await tx.pointsLog.create({
    data: { user_id: input.userId, delta: input.points, reason: "welcome_bonus", performed_by: null },
    select: { id: true },
  });
  await tx.rewardOutcome.create({
    data: {
      welcome_reward_id: input.rewardId,
      user_id: input.userId,
      kind: "POINTS",
      campaign_id: input.campaignId ?? null,
      box_id: input.boxId ?? null,
      points_log_id: log.id,
      request_id: input.requestId ?? null,
    },
  });
}

async function loadReward(tx: Tx, userId: string, rewardId?: string): Promise<WelcomeRewardRecord | null> {
  const reward = await tx.welcomeReward.findFirst({
    where: { user_id: userId, ...(rewardId ? { id: rewardId } : {}) },
    include: WELCOME_REWARD_INCLUDE,
  });
  if (!reward?.outcome) return reward;
  const outcome = reward.outcome;
  const baseMatches = outcome.welcome_reward_id === reward.id && outcome.user_id === reward.user_id;
  const pointsMatch = outcome.pointsLog?.user_id === reward.user_id &&
    outcome.pointsLog.delta === reward.points_amount && outcome.pointsLog.reason === "welcome_bonus";
  const noCampaignDetails = outcome.campaign_id === null && outcome.pool_item_id === null &&
    outcome.box_id === null && outcome.draw_number === null;
  const fixedMatches = reward.mode === "FIXED_VOUCHER" && reward.campaign_id === null && reward.campaign === null &&
    outcome.kind === "VOUCHER" && noCampaignDetails && outcome.pointsLog === null &&
    outcome.voucher?.user_id === reward.user_id && outcome.voucher.issued_via === "WELCOME_GIFT";
  const pointsMatches = reward.mode === "POINTS" && reward.campaign_id === null && reward.campaign === null &&
    outcome.kind === "POINTS" && noCampaignDetails && outcome.voucher === null && pointsMatch;
  const campaignMatches = reward.mode === "GACHA" && reward.campaign_id !== null &&
    reward.campaign?.id === reward.campaign_id && outcome.campaign_id === reward.campaign_id;
  const boxMatches = outcome.box_id !== null && reward.campaign?.boxes.some((box) => box.id === outcome.box_id);
  const poolItem = outcome.pool_item_id === null
    ? undefined
    : reward.campaign?.poolItems.find((item) => item.id === outcome.pool_item_id);
  const gachaVoucherMatches = campaignMatches && outcome.kind === "VOUCHER" &&
    outcome.pool_item_id !== null && outcome.draw_number !== null && boxMatches && outcome.pointsLog === null &&
    poolItem !== undefined && outcome.voucher?.user_id === reward.user_id &&
    outcome.voucher.issued_via === "GACHA_REWARD" && outcome.voucher.package_id === poolItem.voucher_package_id;
  const gachaPointsMatches = campaignMatches && outcome.kind === "POINTS" &&
    outcome.pool_item_id === null && outcome.draw_number === null && boxMatches &&
    outcome.voucher === null && pointsMatch;
  if (!baseMatches || !(fixedMatches || pointsMatches || gachaVoucherMatches || gachaPointsMatches)) {
    throw new Error("Welcome reward identity invariant violated");
  }
  return reward;
}

/** Creates exactly one effective welcome entitlement during registration. */
export async function createWelcomeRewardInTransaction(
  tx: Tx,
  userId: string,
  now = new Date(),
): Promise<WelcomeRewardSummary> {
  await claimActiveCustomerForWrite(tx, userId);
  const existing = await loadReward(tx, userId);
  if (existing) return toWelcomeRewardSummary(existing);
  const settings = await readWelcomeRewardSettings(tx);
  const points = settings?.points_amount ?? 5;
  const createPoints = async () => {
    const reward = await tx.welcomeReward.create({ data: { user_id: userId, mode: "POINTS", points_amount: points } });
    await completeWithPoints(tx, { rewardId: reward.id, userId, points });
    return { id: reward.id, mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS", points } as const;
  };
  if (!settings || settings.mode === "POINTS") return createPoints();
  if (settings.mode === "FIXED_VOUCHER" && settings.fixed_package_id) {
    const reward = await tx.welcomeReward.create({ data: { user_id: userId, mode: "FIXED_VOUCHER", points_amount: points } });
    try {
      const voucher = await issueVoucherInTransaction(tx, {
        user_id: userId, package_id: settings.fixed_package_id, source: "WELCOME_GIFT", now,
      });
      await tx.rewardOutcome.create({
        data: { welcome_reward_id: reward.id, user_id: userId, kind: "VOUCHER", voucher_id: voucher.id },
      });
      return { id: reward.id, mode: "FIXED_VOUCHER", status: "COMPLETED", outcome_kind: "VOUCHER", points: null };
    } catch (error) {
      if (!isWelcomeAvailabilityFailure(error)) throw error;
      await tx.welcomeReward.update({ where: { id: reward.id }, data: { mode: "POINTS" } });
      await completeWithPoints(tx, { rewardId: reward.id, userId, points });
      return { id: reward.id, mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS", points };
    }
  }
  const campaign = settings.activeCampaign;
  if (settings.mode === "GACHA" && campaign && await hasWelcomeCampaignStock(tx, campaign)) {
    const reward = await tx.welcomeReward.create({
      data: { user_id: userId, mode: "GACHA", campaign_id: campaign.id, points_amount: points },
    });
    return { id: reward.id, mode: "GACHA", status: "PENDING", outcome_kind: null, points: null };
  }
  return createPoints();
}

/** Reads the authenticated customer's welcome reward without mutation. */
export async function getWelcomeReward(db: Tx, userId: string): Promise<WelcomeRewardRecord | null> {
  return loadReward(db, userId);
}

/** Opens one pending GACHA entitlement with bounded Serializable conflict retries. */
export async function openWelcomeReward(
  db: WelcomeRewardDatabase,
  input: { userId: string; rewardId: string; boxId: string; requestId: string },
  roll: (total: number) => number = randomInt,
): Promise<WelcomeRewardRecord> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        await claimActiveCustomerForWrite(tx, input.userId);
        const bound = await tx.rewardOutcome.findUnique({ where: { request_id: input.requestId }, select: { welcome_reward_id: true } });
        if (bound && bound.welcome_reward_id !== input.rewardId) throw new WelcomeRewardError("CONFLICT");
        const reward = await loadReward(tx, input.userId, input.rewardId);
        if (!reward) throw new WelcomeRewardError("NOT_FOUND");
        if (reward.outcome) return reward;
        const campaign = reward.campaign;
        if (reward.mode !== "GACHA" || !campaign) throw new WelcomeRewardError("NOT_FOUND");
        if (!campaign.boxes.some((box) => box.id === input.boxId)) throw new WelcomeRewardError("NOT_FOUND");
        if (campaign.status === "PAUSED") throw new WelcomeRewardError("REWARD_PAUSED");

        const used = await tx.rewardOutcome.groupBy({
          by: ["pool_item_id"],
          where: { campaign_id: campaign.id, kind: "VOUCHER", pool_item_id: { not: null } },
          _count: { _all: true },
        });
        const usedMap = new Map(used.map((row) => [row.pool_item_id, row._count._all]));
        const n = used.reduce((sum, row) => sum + row._count._all, 0);
        const remaining = campaign.poolItems.map((item) => ({
          ...item, remaining: Math.max(0, item.quantity - (usedMap.get(item.id) ?? 0)),
        }));
        if (campaign.status === "ENDED" || remaining.every((item) => item.remaining === 0)) {
          await completeWithPoints(tx, {
            rewardId: reward.id, userId: input.userId, points: reward.points_amount, campaignId: campaign.id,
            boxId: input.boxId, requestId: input.requestId,
          });
          return (await loadReward(tx, input.userId, input.rewardId))!;
        }
        if (campaign.status !== "ACTIVE") throw new WelcomeRewardError("REWARD_PAUSED");
        const revision = await tx.rewardCampaign.updateMany({
          where: { id: campaign.id, revision: campaign.revision }, data: { revision: { increment: 1 } },
        });
        if (revision.count !== 1) throw Object.assign(new Error("reward revision conflict"), { code: "P2034" });
        let candidates = remaining.filter((item) => item.remaining > 0 && item.unlock_after_draws <= n);
        if (candidates.length === 0) throw new WelcomeRewardError("REWARD_TEMPORARILY_UNAVAILABLE");
        const availabilityCatalog = await loadVoucherAvailabilityCatalog(tx);
        while (candidates.length) {
          const total = candidates.reduce((sum, item) => sum + item.remaining, 0);
          const selected = selectWeightedReward(candidates, roll(total));
          try {
            const voucher = await issueVoucherInTransaction(tx, {
              user_id: input.userId, package_id: selected.voucher_package_id, source: "GACHA_REWARD",
            }, availabilityCatalog);
            await tx.rewardOutcome.create({ data: {
              welcome_reward_id: reward.id, user_id: input.userId, kind: "VOUCHER",
              campaign_id: campaign.id, pool_item_id: selected.id, box_id: input.boxId,
              voucher_id: voucher.id, draw_number: n + 1, request_id: input.requestId,
            } });
            return (await loadReward(tx, input.userId, input.rewardId))!;
          } catch (error) {
            if (!isWelcomeAvailabilityFailure(error)) throw error;
            candidates = candidates.filter((item) => item.id !== selected.id);
          }
        }
        throw new WelcomeRewardError("REWARD_TEMPORARILY_UNAVAILABLE");
      }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
    } catch (error) {
      const retryable = typeof error === "object" && error !== null && "code" in error && (error.code === "P2034" || error.code === "P2002");
      if (retryable && attempt < 2) continue;
      if (retryable) throw new WelcomeRewardError("CONFLICT");
      throw error;
    }
  }
  throw new WelcomeRewardError("CONFLICT");
}
