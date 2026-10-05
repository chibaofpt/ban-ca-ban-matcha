import type { Prisma } from "@prisma/client";
import type { RegistrationOtpAdminData, RegistrationOtpSettings } from "@/contracts/registrationOtp";
import { prisma } from "@/lib/prisma";
import { RegistrationOtpError } from "@/lib/auth/registrationOtpError";
import { registrationOtpDay, registrationOtpNamespace } from "@/lib/auth/registrationOtpCrypto";
import { registrationOtpCount } from "@/lib/auth/registrationOtpStore";

/** Read authoritative global settings; missing rows and database errors never disable OTP silently. */
export async function readRegistrationOtpSettings(
  database: Pick<Prisma.TransactionClient, "registrationOtpSettings"> = prisma,
): Promise<RegistrationOtpSettings> {
  try {
    const row = await database.registrationOtpSettings.findUnique({ where: { id: 1 } });
    if (!row || typeof row.otp_enabled !== "boolean" || !Number.isSafeInteger(row.daily_send_limit)
      || row.daily_send_limit < 1 || !Number.isSafeInteger(row.revision)) throw new Error("Invalid settings");
    return { otp_enabled: row.otp_enabled, daily_send_limit: row.daily_send_limit, revision: row.revision };
  } catch {
    throw new RegistrationOtpError(503, "BUSINESS_RULE_VIOLATION", "REGISTRATION_OTP_SETTINGS_UNAVAILABLE");
  }
}

/** Read today's reserved paid sends; unavailable stats remain unavailable. */
export async function registrationOtpAdminData(): Promise<RegistrationOtpAdminData> {
  const settings = await readRegistrationOtpSettings();
  const { date } = registrationOtpDay();
  try {
    const count = await registrationOtpCount(`${registrationOtpNamespace()}:day:${date}`);
    return { ...settings, date, today_reserved_count: count, estimated_cost_vnd: count * 350, stats_unavailable: false };
  } catch (error) {
    if (!(error instanceof RegistrationOtpError)) throw error;
    return { ...settings, date, today_reserved_count: null, estimated_cost_vnd: null, stats_unavailable: true };
  }
}

/** Guard concurrent admin configuration edits with the singleton revision. */
export async function updateRegistrationOtpSettings(input: RegistrationOtpSettings): Promise<RegistrationOtpSettings> {
  const update = await prisma.registrationOtpSettings.updateMany({
    where: { id: 1, revision: input.revision },
    data: { otp_enabled: input.otp_enabled, daily_send_limit: input.daily_send_limit, revision: { increment: 1 } },
  });
  if (update.count !== 1) {
    throw new RegistrationOtpError(409, "CONFLICT", "REGISTRATION_OTP_SETTINGS_CHANGED");
  }
  return { ...input, revision: input.revision + 1 };
}
