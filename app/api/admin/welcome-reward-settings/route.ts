import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRewardErrorResponse, requireRewardAdmin, settingsSchema } from "@/lib/adminRewardHttp";
import { getAdminWelcomeRewardSettings, updateAdminWelcomeRewardSettings } from "@/lib/adminWelcomeRewardSettings";

export const dynamic = "force-dynamic";
const db = prisma;

/** Read signup welcome-reward settings. */
export async function GET() {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({ data: { settings: await getAdminWelcomeRewardSettings(db) } });
  } catch (error) { return adminRewardErrorResponse(error); }
}

/** Conditionally update signup welcome-reward settings. */
export async function PUT(req: Request) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const settings = await updateAdminWelcomeRewardSettings(db, {
      mode: parsed.data.mode,
      fixed_package_id: parsed.data.fixed_package_id ?? null,
      active_campaign_id: parsed.data.active_campaign_id ?? null,
      revision: parsed.data.revision,
    });
    return NextResponse.json({ data: { settings } });
  } catch (error) { return adminRewardErrorResponse(error); }
}
