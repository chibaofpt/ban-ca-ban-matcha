import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/serializableTransaction";
import { reorderMenuSchema } from "@/lib/validations/menu";

export const dynamic = "force-dynamic";

type StoredMenuOrder = {
  id: string;
  category: string;
  sort_order: number;
  is_available: boolean;
};

function matchesSnapshot(stored: StoredMenuOrder[], baseline: StoredMenuOrder[]): boolean {
  if (stored.length !== baseline.length) return false;
  const expected = new Map(baseline.map((item) => [item.id, item]));
  return stored.every((item) => {
    const prior = expected.get(item.id);
    return prior?.category === item.category
      && prior.sort_order === item.sort_order
      && prior.is_available === item.is_available;
  });
}

function hasExactCategoryMembership(
  stored: StoredMenuOrder[],
  groups: { latte: string[]; fusion: string[]; extras: string[] },
): boolean {
  const submitted = new Map<string, string>();
  for (const category of ["latte", "fusion", "extras"] as const) {
    for (const id of groups[category]) submitted.set(id, category);
  }
  return submitted.size === stored.length
    && stored.every((item) => submitted.get(item.id) === item.category);
}

/** PUT /api/admin/menu/reorder - replace all menu item ranks within each category. */
export async function PUT(req: Request) {
  const raw = await req.json().catch(() => null);
  const validation = reorderMenuSchema.safeParse(raw);
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
    const updatedAt = new Date();
    const result = await runSerializableTransaction(prisma, async (tx) => {
      const stored = await tx.menuItem.findMany({
        select: { id: true, category: true, sort_order: true, is_available: true },
      });
      if (
        !matchesSnapshot(stored, validation.data.baseline)
        || !hasExactCategoryMembership(stored, validation.data.groups)
      ) return null;

      for (const category of ["latte", "fusion", "extras"] as const) {
        const ids = validation.data.groups[category];
        for (let index = 0; index < ids.length; index += 1) {
          await tx.menuItem.update({
            where: { id: ids[index] },
            data: { sort_order: index, updated_at: updatedAt },
          });
        }
      }
      return { groups: validation.data.groups, updated_at: updatedAt.toISOString() };
    });

    if (!result) {
      return NextResponse.json(
        {
          error: "Menu đã thay đổi, vui lòng tải lại",
          code: "CONFLICT",
          details: { reason: "MENU_CATALOG_CHANGED" },
        },
        { status: 409 },
      );
    }
    await invalidateMenuCaches();
    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "P2034") {
      return NextResponse.json(
        {
          error: "Thứ tự menu vừa được cập nhật, vui lòng thử lại",
          code: "CONFLICT",
          details: { reason: "MENU_REORDER_CONFLICT" },
        },
        { status: 409 },
      );
    }
    console.error("[PUT /api/admin/menu/reorder]", error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
