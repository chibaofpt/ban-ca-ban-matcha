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

  const newImagePaths: string[] = [];
  const oldImagePaths: string[] = [];
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
        max_select: updated.max_select,
        is_dynamic_gram: updated.is_dynamic_gram,
        is_active: updated.is_active,
        created_at: updated.created_at,
        options: updated.options.map(o => ({
          id: o.id,
          addon_group_id: o.addon_group_id,
          label: o.label,
          image_url: o.image_url,
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

    // Server lock: is_dynamic_gram groups must keep max_select = 1
    if (validData.is_dynamic_gram && validData.max_select !== 1) {
      return NextResponse.json(
        { error: "Nhóm giá theo gram bột chỉ cho phép chọn 1 option", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const optionImageKeys = new Set(
      validData.options.flatMap((option) => option.image_key ? [option.image_key] : []),
    );
    if (parsedRequest.optionImages.some((image) => !optionImageKeys.has(image.imageKey))) {
      return NextResponse.json(
        { error: "Ảnh option không khớp dữ liệu biểu mẫu", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const preparedImage = await prepareCatalogImage({
      kind: "addons",
      entityName: validData.name ?? existing.name,
      requestedName: validData.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: existing.image_url,
    });
    if (preparedImage.newPath) newImagePaths.push(preparedImage.newPath);
    if (preparedImage.oldPath) oldImagePaths.push(preparedImage.oldPath);

    const existingOptions = new Map(existing.options.map((option) => [option.id, option]));
    const optionUploads = new Map(
      parsedRequest.optionImages.map((image) => [image.imageKey, image]),
    );
    const preparedOptionImages = new Map<string, Awaited<ReturnType<typeof prepareCatalogImage>>>();
    for (const option of validData.options) {
      if (!option.image_key) continue;
      const upload = optionUploads.get(option.image_key);
      if (!upload) continue;
      const currentImageUrl = option.id
        ? existingOptions.get(option.id)?.image_url ?? null
        : null;
      const preparedOptionImage = await prepareCatalogImage({
        kind: "addons",
        entityName: `${validData.name} ${option.label}`,
        requestedName: upload.requestedName,
        imageFile: upload.imageFile,
        currentImageUrl,
      });
      preparedOptionImages.set(option.image_key, preparedOptionImage);
      if (preparedOptionImage.newPath) newImagePaths.push(preparedOptionImage.newPath);
      if (preparedOptionImage.oldPath) oldImagePaths.push(preparedOptionImage.oldPath);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update group fields
      await tx.addonGroup.update({
        where: { id },
        data: {
          name: validData.name,
          description: validData.description,
          ...(preparedImage.imageUrl !== undefined && { image_url: preparedImage.imageUrl }),
          max_select: validData.max_select,
          is_dynamic_gram: validData.is_dynamic_gram,
          is_required: false,
          min_quantity: null,
          max_quantity: null,
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
            const preparedOptionImage = opt.image_key
              ? preparedOptionImages.get(opt.image_key)
              : undefined;
            // Update existing
            await tx.addonOption.update({
              where: { id: opt.id },
              data: {
                label: opt.label,
                ...(preparedOptionImage?.imageUrl !== undefined && {
                  image_url: preparedOptionImage.imageUrl,
                }),
                price_vnd: opt.price_vnd,
                is_default: false,
                is_active: opt.is_active,
                sort_order: sortOrder,
                gram_value: opt.gram_value,
              }
            });
          } else {
            const preparedOptionImage = opt.image_key
              ? preparedOptionImages.get(opt.image_key)
              : undefined;
            // Create new
            await tx.addonOption.create({
              data: {
                addon_group_id: id,
                label: opt.label,
                image_url: preparedOptionImage?.imageUrl ?? null,
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
      max_select: result.max_select,
      is_dynamic_gram: result.is_dynamic_gram,
      is_active: result.is_active,
      created_at: result.created_at,
      options: result.options.map(o => ({
        id: o.id,
        addon_group_id: o.addon_group_id,
        label: o.label,
        image_url: o.image_url,
        price_vnd: o.price_vnd,
        is_active: o.is_active,
        sort_order: o.sort_order,
        gram_value: o.gram_value ? Number(o.gram_value) : null
      }))
    };

    if (oldImagePaths.length > 0) {
      await removeMenuImages(oldImagePaths).catch(() => undefined);
    }
    await invalidateMenuCaches();
    return NextResponse.json({ data: mappedResult });
  } catch (error: unknown) {
    if (newImagePaths.length > 0 && !databaseCommitted) {
      await removeMenuImages(newImagePaths).catch(() => undefined);
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
      max_select: updated.max_select,
      is_dynamic_gram: updated.is_dynamic_gram,
      is_active: updated.is_active,
      created_at: updated.created_at,
    } });
  } catch (error: unknown) {
    console.error("[DELETE /api/admin/addon-groups/[id]] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
