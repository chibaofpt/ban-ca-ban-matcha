import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reorderAddonGroupsSchema } from "@/lib/validations/addonGroup";
import {
  ADMIN_ADDON_GROUP_ORDER_BY,
  ADMIN_ADDON_OPTION_ORDER_BY,
  mapAdminAddonGroup,
} from "@/lib/adminAddonGroup";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { runSerializableTransaction } from "@/lib/serializableTransaction";

export const dynamic = "force-dynamic";

function hasExactMembership(
  submitted: Array<{ id: string; option_ids: string[] }>,
  stored: Array<{ id: string; options: Array<{ id: string }> }>,
): boolean {
  if (submitted.length !== stored.length) return false;
  const submittedByGroup = new Map(submitted.map((group) => [group.id, new Set(group.option_ids)]));
  for (const group of stored) {
    const optionIds = submittedByGroup.get(group.id);
    if (!optionIds || optionIds.size !== group.options.length) return false;
    if (group.options.some((option) => !optionIds.has(option.id))) return false;
  }
  return true;
}

/** PUT /api/admin/addon-groups/reorder - replace all group and option display ranks. */
export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  const validation = reorderAddonGroupsSchema.safeParse(raw);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await runSerializableTransaction(prisma, async (tx) => {
      const stored = await tx.addonGroup.findMany({
        select: { id: true, options: { select: { id: true } } },
      });
      if (!hasExactMembership(validation.data.groups, stored)) return null;

      const groupRank = new Map(validation.data.groups.map((group, index) => [group.id, index]));
      const optionRank = new Map(
        validation.data.groups.flatMap((group) =>
          group.option_ids.map((optionId, index) => [optionId, index] as const),
        ),
      );

      for (const groupId of [...groupRank.keys()].sort()) {
        await tx.addonGroup.update({
          where: { id: groupId },
          data: { sort_order: groupRank.get(groupId) as number },
        });
      }
      for (const optionId of [...optionRank.keys()].sort()) {
        await tx.addonOption.update({
          where: { id: optionId },
          data: { sort_order: optionRank.get(optionId) as number },
        });
      }

      return tx.addonGroup.findMany({
        include: { options: { orderBy: ADMIN_ADDON_OPTION_ORDER_BY } },
        orderBy: ADMIN_ADDON_GROUP_ORDER_BY,
      });
    });

    if (!result) {
      return NextResponse.json(
        {
          error: "Danh sách addon đã thay đổi, vui lòng thử lại",
          code: "CONFLICT",
          details: { reason: "ADDON_CATALOG_MEMBERSHIP_CHANGED" },
        },
        { status: 409 },
      );
    }
    await invalidateMenuCaches();
    return NextResponse.json({ data: result.map(mapAdminAddonGroup) });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "P2034") {
      return NextResponse.json(
        {
          error: "Thứ tự addon vừa được cập nhật, vui lòng thử lại",
          code: "CONFLICT",
          details: { reason: "ADDON_REORDER_CONFLICT" },
        },
        { status: 409 },
      );
    }
    console.error("[PUT /api/admin/addon-groups/reorder]", error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
