import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { campaignCreateSchema, adminRewardErrorResponse, requireRewardAdmin } from "@/lib/adminRewardHttp";
import { createAdminRewardCampaign, getAdminRewardCampaign, listAdminRewardCampaigns } from "@/lib/adminRewardCampaign";

export const dynamic = "force-dynamic";
const db = prisma;

/** List reward campaign summaries newest first. */
export async function GET() {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  try { return NextResponse.json({ data: { items: await listAdminRewardCampaigns(db) } }); }
  catch (error) { return adminRewardErrorResponse(error); }
}

/** Create one draft reward campaign. */
export async function POST(req: Request) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const parsed = campaignCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const created = await createAdminRewardCampaign(db, parsed.data.name);
    return NextResponse.json({ data: { campaign: await getAdminRewardCampaign(db, created.id) } }, { status: 201 });
  } catch (error) { return adminRewardErrorResponse(error); }
}
