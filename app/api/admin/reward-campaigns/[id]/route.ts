import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRewardErrorResponse, campaignActionSchema, invalidRewardRouteIds, requireRewardAdmin } from "@/lib/adminRewardHttp";
import { getAdminRewardCampaign, mutateAdminRewardCampaign } from "@/lib/adminRewardCampaign";

export const dynamic = "force-dynamic";
const db = prisma;
type Context = { params: Promise<{ id: string }> };

/** Read one reward campaign detail and allocation statistics. */
export async function GET(_req: Request, { params }: Context) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const invalid = invalidRewardRouteIds([id]);
  if (invalid) return invalid;
  try { return NextResponse.json({ data: { campaign: await getAdminRewardCampaign(db, id) } }); }
  catch (error) { return adminRewardErrorResponse(error); }
}

/** Rename or transition one reward campaign with revision protection. */
export async function PATCH(req: Request, { params }: Context) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const invalid = invalidRewardRouteIds([id]);
  if (invalid) return invalid;
  const parsed = campaignActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const campaign = await mutateAdminRewardCampaign(db, id, parsed.data);
    return NextResponse.json({ data: { campaign } });
  } catch (error) { return adminRewardErrorResponse(error); }
}
