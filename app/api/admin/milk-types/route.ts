import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMilkTypeSchema } from "@/lib/validations/milkType";
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
    const milkTypes = await prisma.milkType.findMany({
      orderBy: { display_order: 'asc' },
    });

    return NextResponse.json({ data: milkTypes });
  } catch (error: unknown) {
    console.error("[GET /api/admin/milk-types] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  let newImagePath: string | null = null;
  let databaseCommitted = false;
  try {
    const parsedRequest = await parseCatalogRequest(req);
    if (!parsedRequest.ok) return parsedRequest.response;
    const raw = parsedRequest.raw && typeof parsedRequest.raw === "object" && !Array.isArray(parsedRequest.raw)
      ? parsedRequest.raw as Record<string, unknown>
      : {};

    const validation = createMilkTypeSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    // Upload image before DB write — if upload fails, no DB changes occur
    let imageUrl: string | null = null;
    if (parsedRequest.imageFile) {
      try {
        const prepared = await prepareCatalogImage({
          kind: "milk-types",
          entityName: validData.name,
          requestedName: validData.image_filename,
          imageFile: parsedRequest.imageFile,
          currentImageUrl: null,
        });
        imageUrl = prepared.imageUrl ?? null;
        newImagePath = prepared.newPath;
      } catch (err: unknown) {
        const msg = catalogImageValidationMessage(err) ?? "Không thể tải ảnh lên";
        return NextResponse.json({ error: msg, code: "VALIDATION_ERROR" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (validData.is_default) {
        await tx.milkType.updateMany({
          where: { is_default: true },
          data: { is_default: false },
        });
      }

      const maxOrder = await tx.milkType.aggregate({
        _max: { display_order: true },
      });
      const nextDisplayOrder = (maxOrder._max.display_order ?? 0) + 1;

      return tx.milkType.create({
        data: {
          name: validData.name,
          price_per_ml: validData.price_per_ml,
          is_default: validData.is_default,
          is_active: validData.is_active,
          display_order: nextDisplayOrder,
          ...(imageUrl !== null ? { image_url: imageUrl } : {}),
        },
      });
    });
    databaseCommitted = true;

    await invalidateMenuCaches();
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    // If DB failed after image upload, clean up orphaned image
    if (!databaseCommitted && newImagePath) {
      await removeMenuImages([newImagePath]).catch(() => undefined);
    }
    console.error("[POST /api/admin/milk-types] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
