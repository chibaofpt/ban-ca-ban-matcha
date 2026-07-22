import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateAddonGroupSchema } from "@/lib/validations/addonGroup";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const raw = await req.json();

    const existing = await prisma.addonGroup.findUnique({ 
      where: { id },
      include: { options: true }
    });
    if (!existing) {
      return NextResponse.json({ error: "Nhóm addon không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }

    // Support quick toggle of is_active
    if (Object.keys(raw).length === 1 && "is_active" in raw) {
      if (typeof raw.is_active !== "boolean") {
        return NextResponse.json({ error: "is_active must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      const updated = await prisma.addonGroup.update({
        where: { id },
        data: { is_active: raw.is_active },
        include: { options: { orderBy: { sort_order: 'asc' } } }
      });

      const mappedUpdated = {
        ...updated,
        options: updated.options.map(o => ({
          ...o,
          gram_value: o.gram_value ? Number(o.gram_value) : null
        }))
      };

      await invalidateMenuCaches();
      return NextResponse.json({ data: mappedUpdated });
    }

    // Full update
    const validation = updateAddonGroupSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // Update group fields
      await tx.addonGroup.update({
        where: { id },
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

      // Handle options diff if provided
      if (validData.options) {
        const existingOptionIds = new Set(existing.options.map(o => o.id));
        const incomingOptionIds = new Set(validData.options.filter(o => o.id).map(o => o.id));

        // Delete removed options
        const toDeleteIds = existing.options
          .filter(o => !incomingOptionIds.has(o.id))
          .map(o => o.id);

        if (toDeleteIds.length > 0) {
          await tx.addonOption.deleteMany({
            where: { id: { in: toDeleteIds } }
          });
        }

        // Upsert options
        for (let i = 0; i < validData.options.length; i++) {
          const opt = validData.options[i];
          const sortOrder = opt.sort_order ?? i;
          
          if (opt.id && existingOptionIds.has(opt.id)) {
            // Update existing
            await tx.addonOption.update({
              where: { id: opt.id },
              data: {
                label: opt.label,
                price_vnd: opt.price_vnd,
                is_default: opt.is_default,
                sort_order: sortOrder,
                gram_value: opt.gram_value,
              }
            });
          } else {
            // Create new
            await tx.addonOption.create({
              data: {
                addon_group_id: id,
                label: opt.label,
                price_vnd: opt.price_vnd,
                is_default: opt.is_default,
                sort_order: sortOrder,
                gram_value: opt.gram_value,
              }
            });
          }
        }
      }

      return tx.addonGroup.findUniqueOrThrow({
        where: { id },
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
    return NextResponse.json({ data: mappedResult });
  } catch (error: unknown) {
    console.error("[PUT /api/admin/addon-groups/[id]] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const existing = await prisma.addonGroup.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Nhóm addon không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }

    // Soft delete
    const updated = await prisma.addonGroup.update({
      where: { id },
      data: { is_active: false },
    });

    await invalidateMenuCaches();
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    console.error("[DELETE /api/admin/addon-groups/[id]] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
