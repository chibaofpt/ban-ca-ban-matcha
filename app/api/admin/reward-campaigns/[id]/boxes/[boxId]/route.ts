import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminRewardErrorResponse, invalidRewardRouteIds, parseRewardBoxForm, requireRewardAdmin, revisionSchema } from "@/lib/adminRewardHttp";
import { deleteAdminRewardBox, updateAdminRewardBox } from "@/lib/adminRewardBox";

const db = prisma;
type Context = { params: Promise<{ id: string; boxId: string }> };

/** Edit one visual box while its campaign is draft. */
export async function PATCH(req: Request, { params }: Context) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const ids = await params;
  const invalid = invalidRewardRouteIds([ids.id, ids.boxId]);
  if (invalid) return invalid;
  const form = await parseRewardBoxForm(req, false);
  if (!form) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    const result = await updateAdminRewardBox(db, {
      campaignId: ids.id, boxId: ids.boxId, revision: form.revision,
      fields: {
        ...(form.name !== undefined && { name: form.name }),
        ...(form.mouth_anchor_x !== undefined && { mouth_anchor_x: form.mouth_anchor_x }),
        ...(form.mouth_anchor_y !== undefined && { mouth_anchor_y: form.mouth_anchor_y }),
      },
      closedImage: form.closedImage, openImage: form.openImage,
    });
    return NextResponse.json({ data: result });
  } catch (error) { return adminRewardErrorResponse(error); }
}

/** Delete one visual box while its campaign is draft. */
export async function DELETE(req: Request, { params }: Context) {
  const unauthorized = await requireRewardAdmin();
  if (unauthorized) return unauthorized;
  const ids = await params;
  const invalid = invalidRewardRouteIds([ids.id, ids.boxId]);
  if (invalid) return invalid;
  const parsed = revisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", code: "VALIDATION_ERROR" }, { status: 400 });
  try {
    return NextResponse.json({ data: await deleteAdminRewardBox(db, ids.id, ids.boxId, parsed.data.revision) });
  } catch (error) { return adminRewardErrorResponse(error); }
}
