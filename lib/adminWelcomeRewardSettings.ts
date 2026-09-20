import type {
  AdminRewardMode,
  AdminWelcomeRewardSettings,
} from "@/contracts/admin/reward";
import { AdminRewardError, type AdminRewardDatabase, type AdminRewardTransaction } from "@/lib/adminRewardCampaign";

export type WelcomeSettingsMode = AdminRewardMode;
export type WelcomeSettingsInput = AdminWelcomeRewardSettings;

function project(
  settings: Awaited<ReturnType<AdminRewardTransaction["welcomeRewardSettings"]["findUnique"]>>,
): AdminWelcomeRewardSettings {
  return settings ?? { mode: "POINTS" as const, fixed_package_id: null, active_campaign_id: null, revision: 0 };
}

/** Read the singleton welcome-reward settings with the POINTS default projection. */
export async function getAdminWelcomeRewardSettings(
  db: AdminRewardTransaction,
): Promise<AdminWelcomeRewardSettings> {
  return project(await db.welcomeRewardSettings.findUnique({ where: { id: 1 } }));
}

/** Conditionally update singleton welcome-reward settings after reference validation. */
export async function updateAdminWelcomeRewardSettings(
  db: AdminRewardDatabase,
  input: WelcomeSettingsInput,
  now = new Date(),
): Promise<AdminWelcomeRewardSettings> {
  try {
    return await db.$transaction(async (tx) => {
      if (input.mode === "FIXED_VOUCHER") {
        if (!input.fixed_package_id) throw new AdminRewardError("PACKAGE_UNAVAILABLE");
        const pkg = await tx.voucherPackage.findUnique({ where: { id: input.fixed_package_id } });
        if (!pkg || !pkg.is_active || (pkg.ends_at && pkg.ends_at <= now)) throw new AdminRewardError("PACKAGE_UNAVAILABLE");
      }
      if (input.mode === "GACHA") {
        if (!input.active_campaign_id) throw new AdminRewardError("CAMPAIGN_NOT_READY");
        const campaign = await tx.rewardCampaign.findUnique({ where: { id: input.active_campaign_id } });
        if (!campaign || campaign.status !== "ACTIVE") throw new AdminRewardError("CAMPAIGN_NOT_READY");
      }
      const existing = await tx.welcomeRewardSettings.findUnique({ where: { id: 1 } });
      const data = { mode: input.mode, fixed_package_id: input.fixed_package_id, active_campaign_id: input.active_campaign_id };
      if (!existing) {
        if (input.revision !== 0) throw new AdminRewardError("CONFLICT");
        await tx.welcomeRewardSettings.create({ data: { id: 1, ...data } });
      } else {
        const result = await tx.welcomeRewardSettings.updateMany({
          where: { id: 1, revision: input.revision }, data: { ...data, revision: { increment: 1 } },
        });
        if (result.count !== 1) throw new AdminRewardError("CONFLICT");
      }
      return getAdminWelcomeRewardSettings(tx);
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new AdminRewardError("CONFLICT");
    }
    throw error;
  }
}
