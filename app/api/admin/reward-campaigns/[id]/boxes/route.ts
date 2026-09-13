import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRewardErrorResponse, invalidRewardRouteIds, parseRewardBoxForm, requireRewardAdmin } from "@/lib/adminRewardHttp";
import { createAdminRewardBox } from "@/lib/adminRewardBox";

const db = prisma;

/** Add a visual box to a draft reward campaign. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const invalid = invalidRewardRouteIds([id]);
  if (invalid) return invalid;
  const form = await parseRewardBoxForm(req, true);
  if (!form || !form.name || !form.closedImage || !form.openImage) {
    return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  }
  try {
    const result = await createAdminRewardBox(db, {
      campaignId: id, revision: form.revision,
      fields: { name: form.name, mouth_anchor_x: form.mouth_anchor_x ?? 0.5, mouth_anchor_y: form.mouth_anchor_y ?? 0.2 },
      closedImage: form.closedImage, openImage: form.openImage,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) { return adminRewardErrorResponse(error); }
}
