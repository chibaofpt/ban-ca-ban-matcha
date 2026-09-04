import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAddonGroupSchema } from "@/lib/validations/addonGroup";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { parseCatalogRequest } from "@/lib/catalogRequest";
import {
  catalogImageValidationMessage,
  prepareCatalogImage,
} from "@/lib/catalogImage";
import { removeMenuImages } from "@/lib/storage";

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
      id: g.id,
      name: g.name,
      description: g.description,
      image_url: g.image_url,
      max_select: g.max_select,
      is_dynamic_gram: g.is_dynamic_gram,
      is_active: g.is_active,
      created_at: g.created_at,
      options: g.options.map(o => ({
        id: o.id,
        addon_group_id: o.addon_group_id,
        label: o.label,
        image_url: o.image_url,
        price_vnd: o.price_vnd,
        is_active: o.is_active,
        sort_order: o.sort_order,
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

  const newImagePaths: string[] = [];
  let databaseCommitted = false;
  try {
    const parsedRequest = await parseCatalogRequest(req);
    if (!parsedRequest.ok) return parsedRequest.response;
    const validation = createAddonGroupSchema.safeParse(parsedRequest.raw);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;
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
      entityName: validData.name,
      requestedName: validData.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: null,
    });
    if (preparedImage.newPath) newImagePaths.push(preparedImage.newPath);

    const optionUploads = new Map(
      parsedRequest.optionImages.map((image) => [image.imageKey, image]),
    );
    const optionImageUrls = new Map<string, string>();
    for (const option of validData.options) {
      if (!option.image_key) continue;
      const upload = optionUploads.get(option.image_key);
      if (!upload) continue;
      const preparedOptionImage = await prepareCatalogImage({
        kind: "addons",
        entityName: `${validData.name} ${option.label}`,
        requestedName: upload.requestedName,
        imageFile: upload.imageFile,
        currentImageUrl: null,
      });
      if (preparedOptionImage.newPath) newImagePaths.push(preparedOptionImage.newPath);
      if (preparedOptionImage.imageUrl) {
        optionImageUrls.set(option.image_key, preparedOptionImage.imageUrl);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.addonGroup.create({
        data: {
          name: validData.name,
          description: validData.description,
          image_url: preparedImage.imageUrl ?? null,
          max_select: validData.max_select,
          is_dynamic_gram: validData.is_dynamic_gram,
          is_required: false,
          min_quantity: null,
          max_quantity: null,
          is_active: validData.is_active,
        }
      });

      await tx.addonOption.createMany({
        data: validData.options.map((opt, idx) => ({
          addon_group_id: group.id,
          label: opt.label,
          image_url: opt.image_key ? optionImageUrls.get(opt.image_key) ?? null : null,
          price_vnd: opt.price_vnd,
          is_default: false,
          is_active: opt.is_active,
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

    await invalidateMenuCaches();
    return NextResponse.json({ data: mappedResult }, { status: 201 });
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
    console.error("[POST /api/admin/addon-groups] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
