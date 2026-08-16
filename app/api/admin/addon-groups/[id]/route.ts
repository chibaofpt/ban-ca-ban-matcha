import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateAddonGroupSchema } from "@/lib/validations/addonGroup";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { parseCatalogRequest } from "@/lib/catalogRequest";
import {
  catalogImageValidationMessage,
  prepareCatalogImage,
} from "@/lib/catalogImage";
import { removeMenuImages } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let newImagePath: string | null = null;
  let oldImagePath: string | null = null;
  let databaseCommitted = false;
  try {
    const { id } = await params;
    const parsedRequest = await parseCatalogRequest(req);
    if (!parsedRequest.ok) return parsedRequest.response;
    const raw = parsedRequest.raw && typeof parsedRequest.raw === "object" && !Array.isArray(parsedRequest.raw)
      ? parsedRequest.raw as Record<string, unknown>
      : {};

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
        id: updated.id,
        name: updated.name,
        description: updated.description,
        image_url: updated.image_url,
        type: updated.type,
        max_quantity: updated.max_quantity,
        is_active: updated.is_active,
        created_at: updated.created_at,
        options: updated.options.map(o => ({
          id: o.id,
          addon_group_id: o.addon_group_id,
          label: o.label,
          price_vnd: o.price_vnd,
          is_active: o.is_active,
          sort_order: o.sort_order,
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
    const preparedImage = await prepareCatalogImage({
      kind: "addons",
      entityName: validData.name ?? existing.name,
      requestedName: validData.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: existing.image_url,
    });
    newImagePath = preparedImage.newPath;
    oldImagePath = preparedImage.oldPath;

    const result = await prisma.$transaction(async (tx) => {
      // Update group fields
      await tx.addonGroup.update({
        where: { id },
        data: {
          name: validData.name,
          description: validData.description,
          ...(preparedImage.imageUrl !== undefined && { image_url: preparedImage.imageUrl }),
          type: validData.type,
          is_required: false,
          min_quantity: null,
          max_quantity: validData.max_quantity,
          is_active: validData.is_active,
        }
      });

      // Handle options diff if provided
      if (validData.options) {
        const existingOptionIds = new Set(existing.options.map(o => o.id));
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
                is_default: false,
                is_active: opt.is_active,
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
                is_default: false,
                is_active: opt.is_active,
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
    databaseCommitted = true;

    const mappedResult = {
      id: result.id,
      name: result.name,
      description: result.description,
      image_url: result.image_url,
      type: result.type,
      max_quantity: result.max_quantity,
      is_active: result.is_active,
      created_at: result.created_at,
      options: result.options.map(o => ({
        id: o.id,
        addon_group_id: o.addon_group_id,
        label: o.label,
        price_vnd: o.price_vnd,
        is_active: o.is_active,
        sort_order: o.sort_order,
        gram_value: o.gram_value ? Number(o.gram_value) : null
      }))
    };

    if (oldImagePath) {
      await removeMenuImages([oldImagePath]).catch(() => undefined);
    }
    await invalidateMenuCaches();
    return NextResponse.json({ data: mappedResult });
  } catch (error: unknown) {
    if (newImagePath && !databaseCommitted) {
      await removeMenuImages([newImagePath]).catch(() => undefined);
    }
    const imageMessage = catalogImageValidationMessage(error);
    if (imageMessage) {
      return NextResponse.json(
        { error: imageMessage, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
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
    return NextResponse.json({ data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      image_url: updated.image_url,
      type: updated.type,
      max_quantity: updated.max_quantity,
      is_active: updated.is_active,
      created_at: updated.created_at,
    } });
  } catch (error: unknown) {
    console.error("[DELETE /api/admin/addon-groups/[id]] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
