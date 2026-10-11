import type { Prisma } from "@prisma/client";
import type { WelcomeRewardPreview } from "@/contracts/reward";
import { readAvailableVoucherPackage, VoucherIssuanceError } from "@/lib/vouchers/voucherIssuance";
import type { VoucherAvailabilityDatabase } from "@/lib/vouchers/voucherAvailability";

type Database = Pick<Prisma.TransactionClient, "welcomeRewardSettings" | "rewardOutcome" | "voucherPackage"> & VoucherAvailabilityDatabase;

/** Read the current reward configuration and campaign allocation without reserving stock. */
export async function readWelcomeRewardSettings(db: Pick<Database, "welcomeRewardSettings">) {
  return db.welcomeRewardSettings.findUnique({
    where: { id: 1 }, include: { activeCampaign: { include: { poolItems: true } } },
  });
}
type Campaign = NonNullable<NonNullable<Awaited<ReturnType<typeof readWelcomeRewardSettings>>>["activeCampaign"]>;

/** Check the same active-campaign allocation condition used during registration. */
export async function hasWelcomeCampaignStock(db: Pick<Database, "rewardOutcome">, campaign: Campaign | null): Promise<boolean> {
  if (campaign?.status !== "ACTIVE") return false;
  const ids = campaign.poolItems.map((item) => item.id);
  const used = ids.length ? await db.rewardOutcome.groupBy({
    by: ["pool_item_id"], where: { pool_item_id: { in: ids }, kind: "VOUCHER" }, _count: { _all: true },
  }) : [];
  const counts = new Map(used.map((row) => [row.pool_item_id, row._count._all]));
  return campaign.poolItems.some((item) => item.quantity - (counts.get(item.id) ?? 0) > 0);
}

/** Identify availability failures eligible for the existing welcome fallback policy. */
export function isWelcomeAvailabilityFailure(error: unknown): boolean {
  return error instanceof VoucherIssuanceError && [
    "NOT_FOUND", "VOUCHER_PACKAGE_EXPIRED", "TARGET_UNAVAILABLE", "NO_ACTIVE_QUALIFIER", "NO_ACTIVE_REWARD", "NO_ACTIVE_CONFIGURATION",
  ].includes(error.reason);
}

/** Project a public signup offer; registration remains authoritative when availability changes. */
export async function getWelcomeRewardPreview(db: Database, now = new Date()): Promise<WelcomeRewardPreview> {
  const settings = await readWelcomeRewardSettings(db);
  const points_amount = settings?.points_amount ?? 5;
  if (settings?.mode === "FIXED_VOUCHER" && settings.fixed_package_id) {
    try {
      await readAvailableVoucherPackage(db, { package_id: settings.fixed_package_id, source: "WELCOME_GIFT", now });
      return { mode: "FIXED_VOUCHER", points_amount };
    } catch (error) {
      if (!isWelcomeAvailabilityFailure(error)) throw error;
    }
  } else if (settings?.mode === "GACHA" && await hasWelcomeCampaignStock(db, settings.activeCampaign)) {
    return { mode: "GACHA", points_amount };
  }
  return { mode: "POINTS", points_amount };
}
