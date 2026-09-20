import type { Prisma } from "@prisma/client";
import type { WelcomeReward, WelcomeRewardSummary } from "@/contracts/reward";
import { attachBundleRewardBaselines } from "@/lib/voucherBundleDto";
import {
  attachOwnedVoucherAvailability,
  loadVoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";
import {
  PUBLIC_VOUCHER_PACKAGE_SELECT,
  serializePublicVoucherDto,
  toPublicVoucherDto,
} from "@/lib/voucherPublicDto";

export const WELCOME_REWARD_INCLUDE = {
  campaign: {
    include: {
      boxes: { orderBy: { sort_order: "asc" as const } },
      poolItems: { orderBy: { id: "asc" as const } },
    },
  },
  outcome: {
    include: {
      pointsLog: { select: { user_id: true, delta: true, reason: true } },
      voucher: {
        include: {
          package: {
            select: PUBLIC_VOUCHER_PACKAGE_SELECT,
          },
          menuItem: { select: { name: true, is_available: true } },
          menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
          addonOptionScopes: { include: { addonOption: { select: { label: true, price_vnd: true, is_active: true, gram_value: true } } } },
          addonOption: { select: { label: true } },
          staff: { select: { name: true, role: true } },
          pointsLogs: {
            where: { reason: "voucher_purchase" },
            select: { delta: true, reason: true },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.WelcomeRewardInclude;

export type WelcomeRewardRecord = Prisma.WelcomeRewardGetPayload<{ include: typeof WELCOME_REWARD_INCLUDE }>;
export type WelcomeRewardProjectionDatabase = VoucherAvailabilityDatabase &
  Parameters<typeof attachBundleRewardBaselines>[0];

export type { WelcomeRewardSummary } from "@/contracts/reward";

/** Maps one welcome reward to its registration response summary. */
export function toWelcomeRewardSummary(reward: Pick<WelcomeRewardRecord, "id" | "mode" | "outcome">): WelcomeRewardSummary {
  return {
    id: reward.id,
    mode: reward.mode,
    status: reward.outcome ? "COMPLETED" : "PENDING",
    outcome_kind: reward.outcome?.kind ?? null,
  };
}

/** Maps one owned welcome reward through the canonical wallet voucher projection. */
export async function toWelcomeRewardDto(
  db: WelcomeRewardProjectionDatabase,
  reward: WelcomeRewardRecord,
  now = new Date(),
): Promise<WelcomeReward> {
  const unavailableReason = reward.mode === "GACHA" && !reward.outcome && reward.campaign?.status === "PAUSED"
    ? "REWARD_PAUSED"
    : null;
  let outcome: WelcomeReward["outcome"] = null;
  if (reward.outcome?.kind === "POINTS") {
    outcome = { kind: "POINTS", points: 5 };
  } else if (reward.outcome?.voucher) {
    const catalog = await loadVoucherAvailabilityCatalog(db);
    const [withAvailability] = attachOwnedVoucherAvailability([reward.outcome.voucher], catalog, now);
    const [withBaseline] = await attachBundleRewardBaselines(db, [withAvailability]);
    const voucher = toPublicVoucherDto(withBaseline);
    const effectiveVoucher = withBaseline.status === "ACTIVE" && withBaseline.expires_at && withBaseline.expires_at <= now
      ? { ...voucher, status: "EXPIRED" as const }
      : voucher;
    const serializedVoucher = serializePublicVoucherDto(effectiveVoucher);
    if (!serializedVoucher.availability) {
      throw new Error("Welcome reward voucher availability is required");
    }
    outcome = {
      kind: "VOUCHER",
      voucher: {
        ...serializedVoucher,
        availability: serializedVoucher.availability,
      },
    };
  }
  return {
    id: reward.id,
    mode: reward.mode,
    status: reward.outcome ? "COMPLETED" as const : "PENDING" as const,
    can_open: reward.mode === "GACHA" && !reward.outcome &&
      (reward.campaign?.status === "ACTIVE" || reward.campaign?.status === "ENDED"),
    unavailable_reason: unavailableReason,
    campaign: reward.mode === "GACHA" && reward.campaign ? {
      id: reward.campaign.id,
      name: reward.campaign.name,
      status: reward.campaign.status,
      boxes: reward.campaign.boxes.map((box) => ({
        id: box.id,
        name: box.name,
        closed_image_url: box.closed_image_url,
        open_image_url: box.open_image_url,
        mouth_anchor_x: Number(box.mouth_anchor_x),
        mouth_anchor_y: Number(box.mouth_anchor_y),
        sort_order: box.sort_order,
      })),
    } : null,
    outcome,
  };
}
