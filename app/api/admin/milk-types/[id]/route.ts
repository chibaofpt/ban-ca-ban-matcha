import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateMilkTypeSchema } from "@/lib/validations/milkType";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { parseCatalogRequest } from "@/lib/catalogRequest";
import {
  catalogImageValidationMessage,
  prepareCatalogImage,
} from "@/lib/catalogImage";
import { removeMenuImages, parseMenuImagePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let newImagePath: string | null = null;
  let oldImagePathToDelete: string | null = null;
  let databaseCommitted = false;
  try {
    const { id } = await params;
    const parsedRequest = await parseCatalogRequest(req);
    if (!parsedRequest.ok) return parsedRequest.response;
    const raw = parsedRequest.raw && typeof parsedRequest.raw === "object" && !Array.isArray(parsedRequest.raw)
      ? parsedRequest.raw as Record<string, unknown>
      : {};

    const existing = await prisma.milkType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Loại sữa không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }
    const activeFusionDefaultCount = await prisma.menuItem.count({
      where: { is_available: true, category: "fusion", default_base_liquid_id: id },
    });

    // Support quick toggle of is_active (JSON body, single field)
    if (Object.keys(raw).length === 1 && "is_active" in raw) {
      if (typeof raw.is_active !== "boolean") {
        return NextResponse.json({ error: "is_active must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      if (!raw.is_active && existing.is_default) {
        return NextResponse.json(
          { error: "Không thể ẩn loại sữa mặc định", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      if (!raw.is_active && activeFusionDefaultCount > 0) {
        return NextResponse.json(
          { error: "Base Liquid đang là mặc định của món Fusion đang bán", code: "BUSINESS_RULE_VIOLATION" },
          { status: 422 },
        );
      }

      const updated = await prisma.milkType.update({
        where: { id },
        data: { is_active: raw.is_active },
      });

      await invalidateMenuCaches();
      return NextResponse.json({ data: updated });
    }

    // Reorder support: if only display_order is provided
    if (Object.keys(raw).length === 1 && "display_order" in raw) {
      if (typeof raw.display_order !== "number") {
        return NextResponse.json({ error: "display_order must be a number", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      const updated = await prisma.milkType.update({
        where: { id },
        data: { display_order: raw.display_order }
      });

      await invalidateMenuCaches();
      return NextResponse.json({ data: updated });
    }

    // Full update (supports multipart for image upload)
    const validation = updateMilkTypeSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    const nextIsDefault = validData.is_default ?? existing.is_default;
    const nextIsActive = validData.is_active ?? existing.is_active;
    if (nextIsDefault && !nextIsActive) {
      return NextResponse.json(
        { error: "Base Liquid mặc định phải đang hoạt động", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    if (existing.is_default && validData.is_default === false) {
      return NextResponse.json(
        { error: "Hãy chọn một Base Liquid khác làm mặc định", code: "BUSINESS_RULE_VIOLATION" },
        { status: 422 },
      );
    }
    if (validData.is_active === false && existing.is_default && validData.is_default !== false) {
      return NextResponse.json(
        { error: "Không thể ẩn loại sữa đang là mặc định", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (validData.is_active === false && activeFusionDefaultCount > 0) {
      return NextResponse.json(
        { error: "Base Liquid đang là mặc định của món Fusion đang bán", code: "BUSINESS_RULE_VIOLATION" },
        { status: 422 },
      );
    }

    // ── Image handling (before DB write) ──────────────────────────────────────
    // imageUpdate: undefined = no change; null = remove; string = new URL
    let imageUpdate: string | null | undefined = undefined;

    if (validData.remove_image) {
      // Explicitly remove image
      imageUpdate = null;
      if (existing.image_url) {
        oldImagePathToDelete = parseMenuImagePath(existing.image_url);
      }
    } else if (parsedRequest.imageFile) {
      try {
        const prepared = await prepareCatalogImage({
          kind: "milk-types",
          entityName: validData.name ?? existing.name,
          requestedName: validData.image_filename,
          imageFile: parsedRequest.imageFile,
          currentImageUrl: existing.image_url,
        });
        imageUpdate = prepared.imageUrl ?? null;
        newImagePath = prepared.newPath;
        oldImagePathToDelete = prepared.oldPath;
      } catch (err: unknown) {
        const msg = catalogImageValidationMessage(err) ?? "Không thể tải ảnh lên";
        return NextResponse.json({ error: msg, code: "VALIDATION_ERROR" }, { status: 400 });
      }
    } else if (validData.image_filename && existing.image_url) {
      // SEO rename only — copy existing to new path
      try {
        const prepared = await prepareCatalogImage({
          kind: "milk-types",
          entityName: validData.name ?? existing.name,
          requestedName: validData.image_filename,
          imageFile: null,
          currentImageUrl: existing.image_url,
        });
        imageUpdate = prepared.imageUrl;
        newImagePath = prepared.newPath;
        oldImagePathToDelete = prepared.oldPath;
      } catch (err: unknown) {
        const msg = catalogImageValidationMessage(err) ?? "Không thể đổi tên ảnh";
        return NextResponse.json({ error: msg, code: "VALIDATION_ERROR" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (validData.is_default) {
        await tx.milkType.updateMany({
          where: { is_default: true, id: { not: id } },
          data: { is_default: false },
        });
      }

      const updated = await tx.milkType.update({
        where: { id },
        data: {
          name: validData.name,
          price_per_ml: validData.price_per_ml,
          is_default: validData.is_default,
          is_active: validData.is_active,
          ...(imageUpdate !== undefined ? { image_url: imageUpdate } : {}),
        },
      });
      await tx.menuItem.updateMany({
        where: {
          OR: [
            { default_base_liquid_id: id },
            { allowedBaseLiquids: { some: { base_liquid_id: id } } },
            ...(existing.is_default || validData.is_default ? [{ category: "latte" }] : []),
          ],
        },
        data: { updated_at: new Date() },
      });
      return updated;
    });
    databaseCommitted = true;

    // Clean up old image after successful DB commit
    if (oldImagePathToDelete && (newImagePath !== null || imageUpdate === null)) {
      await removeMenuImages([oldImagePathToDelete]).catch(() => undefined);
    }

    await invalidateMenuCaches();
    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    // If DB failed after uploading new image, remove the orphan
    if (!databaseCommitted && newImagePath) {
      await removeMenuImages([newImagePath]).catch(() => undefined);
    }
    console.error("[PUT /api/admin/milk-types/[id]] Error:", error instanceof Error ? error.message : error);
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

    const existing = await prisma.milkType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Loại sữa không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }

    if (existing.is_default) {
      return NextResponse.json(
        { error: "Không thể xóa loại sữa mặc định", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    const activeFusionDefaultCount = await prisma.menuItem.count({
      where: { is_available: true, category: "fusion", default_base_liquid_id: id },
    });
    if (activeFusionDefaultCount > 0) {
      return NextResponse.json(
        { error: "Base Liquid đang là mặc định của món Fusion đang bán", code: "BUSINESS_RULE_VIOLATION" },
        { status: 422 },
      );
    }

    // Soft delete
    const updated = await prisma.milkType.update({
      where: { id },
      data: { is_active: false },
    });

    await invalidateMenuCaches();
    return NextResponse.json({ data: updated });
  } catch (error: unknown) {
    console.error("[DELETE /api/admin/milk-types/[id]] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
