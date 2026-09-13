import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRewardErrorResponse, invalidRewardRouteIds, poolSchema, requireRewardAdmin, validatePoolReachability } from "@/lib/adminRewardHttp";
import { replaceAdminRewardPool } from "@/lib/adminRewardCampaign";

const db = prisma;

/** Replace a draft campaign pool atomically. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const invalid = invalidRewardRouteIds([id]);
  if (invalid) return invalid;
  const parsed = poolSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    validatePoolReachability(parsed.data.items);
    const campaign = await replaceAdminRewardPool(db, id, parsed.data.revision, parsed.data.items);
    return NextResponse.json({ data: { campaign } });
  } catch (error) { return adminRewardErrorResponse(error); }
}
