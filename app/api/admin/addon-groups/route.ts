import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAddonGroupSchema } from "@/lib/validations/addonGroup";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const groups = await prisma.addonGroup.findMany({
      include: {
        options: {
          orderBy: { sort_order: 'asc' }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const mapped = groups.map(g => ({
      ...g,
      options: g.options.map(o => ({
        ...o,
        gram_value: o.gram_value ? Number(o.gram_value) : null
      }))
    }));

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("[GET /api/admin/addon-groups] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const raw = await req.json();
    const validation = createAddonGroupSchema.safeParse(raw);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.addonGroup.create({
        data: {
          name: validData.name,
          description: validData.description,
          type: validData.type,
          is_required: validData.is_required,
          min_quantity: validData.min_quantity,
          max_quantity: validData.max_quantity,
          is_active: validData.is_active,
        }
      });

      await tx.addonOption.createMany({
        data: validData.options.map((opt, idx) => ({
          addon_group_id: group.id,
          label: opt.label,
          price_vnd: opt.price_vnd,
          is_default: opt.is_default,
          sort_order: opt.sort_order ?? idx,
          gram_value: opt.gram_value,
        }))
      });

      return tx.addonGroup.findUniqueOrThrow({
        where: { id: group.id },
        include: {
          options: { orderBy: { sort_order: 'asc' } }
        }
      });
    });

    const mappedResult = {
      ...result,
      options: result.options.map(o => ({
        ...o,
        gram_value: o.gram_value ? Number(o.gram_value) : null
      }))
    };

    await invalidateMenuCaches();
    return NextResponse.json({ data: mappedResult }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/admin/addon-groups] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
