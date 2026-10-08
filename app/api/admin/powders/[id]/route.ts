import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePowderSchema } from "@/lib/validations/powder";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { Prisma } from "@prisma/client";
import { parseCatalogRequest } from "@/lib/catalog/catalogRequest";
import {
  catalogImageValidationMessage,
  prepareCatalogImage,
} from "@/lib/catalog/catalogImage";
import { removeMenuImages } from "@/lib/storage";
import { runSerializableTransaction } from "@/lib/serializableTransaction";
import { syncPowderAvailability, powderAvailabilityErrorResponse } from "@/lib/powderAvailability";

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

    // Support quick toggle of is_available
    if ("is_available" in raw && Object.keys(raw).every((key) => key === "is_available" || key === "fusion_powder_replacements")) {
      const isAvailable = raw.is_available;
      if (typeof isAvailable !== "boolean") {
        return NextResponse.json({ error: "is_available must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      const validation = updatePowderSchema.safeParse(raw);
      if (!validation.success) return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" }, { status: 400 });
      const { updated, disabledLatteId } = await runSerializableTransaction(prisma, async (tx) => {
        const latteId = await syncPowderAvailability(tx, id, isAvailable, validation.data.fusion_powder_replacements);
        const updated = await tx.matchaPowder.findUniqueOrThrow({ where: { id }, include: { powderSizeConfigs: true } });
        return { updated, disabledLatteId: !isAvailable && latteId ? latteId : undefined };
      });
      const mappedUpdated = {
        ...updated,
        size_config: updated.powderSizeConfigs.map((c) => ({
          size: c.size,
          grams: Number(c.grams),
        })),
        powderSizeConfigs: undefined,
        ...(disabledLatteId !== undefined && { disabled_latte_id: disabledLatteId }),
      };

      await invalidateMenuCaches();
      return NextResponse.json({ data: mappedUpdated });
    }

    // Full update
    const validation = updatePowderSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;
    const existing = await prisma.matchaPowder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Bột không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }
    const preparedImage = await prepareCatalogImage({
      kind: "powders",
      entityName: validData.name ?? existing.name,
      requestedName: validData.image_filename,
      imageFile: parsedRequest.imageFile,
      currentImageUrl: existing.image_url,
    });
    newImagePath = preparedImage.newPath;
    oldImagePath = preparedImage.oldPath;

    // Partial creation-schema defaults must not turn an omitted status into an enable request.
    const availability = raw.is_available === undefined ? undefined : validData.is_available;
    const result = await runSerializableTransaction(prisma, async (tx) => {
      if (availability !== undefined || validData.reference_latte_item_id !== undefined) {
        const nextAvailability = availability ?? (await tx.matchaPowder.findUniqueOrThrow({
          where: { id }, select: { is_available: true },
        })).is_available;
        await syncPowderAvailability(tx, id, nextAvailability,
          validData.fusion_powder_replacements, validData.reference_latte_item_id);
      }
      // Update powder details
      await tx.matchaPowder.update({
        where: { id },
        data: {
          name: validData.name,
          manufacturer: validData.manufacturer,
          description: validData.description,
          ...(preparedImage.imageUrl !== undefined && { image_url: preparedImage.imageUrl }),
          price_per_gram: validData.price_per_gram,
          type: validData.type,
          reference_latte_item_id: validData.reference_latte_item_id,
          fragrance: validData.fragrance,
          body: validData.body,
          bitterness: validData.bitterness,
          umami: validData.umami,
          color: validData.color,
          is_available: availability,
        },
      });

      // Update size_config if provided
      if (validData.size_config !== undefined) {
        // Delete all existing config for this powder
        await tx.powderSizeConfig.deleteMany({
          where: { powder_id: id },
        });

        // Insert new config if any
        if (validData.size_config.length > 0) {
          await tx.powderSizeConfig.createMany({
            data: validData.size_config.map((sc) => ({
              powder_id: id,
              size: sc.size,
              grams: sc.grams,
            })),
          });
        }
      }

      return tx.matchaPowder.findUniqueOrThrow({
        where: { id },
        include: { powderSizeConfigs: true },
      });
    });
    databaseCommitted = true;

    const mappedResult = {
      ...result,
      size_config: result.powderSizeConfigs.map((c) => ({
        size: c.size,
        grams: Number(c.grams),
      })),
      powderSizeConfigs: undefined,
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
    if (error instanceof Error && "code" in error && error.code === "P2034") return NextResponse.json({ error: "Dữ liệu đã thay đổi, vui lòng tải lại và thử lại", code: "CONFLICT" }, { status: 409 });
    const availabilityError = powderAvailabilityErrorResponse(error);
    if (availabilityError) return availabilityError;
    const imageMessage = catalogImageValidationMessage(error);
    if (imageMessage) {
      return NextResponse.json(
        { error: imageMessage, code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    console.error("[PUT /api/admin/powders/[id]] Error:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Bột không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }
    const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(target) && target.includes("reference_latte_item_id")) {
        return NextResponse.json(
            { error: "Latte item này đã được gán cho một bột khác", code: "VALIDATION_ERROR" },
            { status: 400 }
        );
    }
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

    const text = await req.text();
    let raw: unknown;
    try { raw = text.trim() ? JSON.parse(text) : {}; } catch { raw = null; }
    const validation = updatePowderSchema.safeParse(raw);
    if (!validation.success) return NextResponse.json(
      { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" }, { status: 400 });
    const { updated, disabledLatteId } = await runSerializableTransaction(prisma, async (tx) => {
      const latteId = await syncPowderAvailability(tx, id, false, validation.data.fusion_powder_replacements);
      const updated = await tx.matchaPowder.findUniqueOrThrow({ where: { id } });
      return { updated, disabledLatteId: latteId ?? undefined };
    });
    await invalidateMenuCaches();
    return NextResponse.json({
      data: {
        ...updated,
        ...(disabledLatteId !== undefined && { disabled_latte_id: disabledLatteId }),
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "P2034") return NextResponse.json({ error: "Dữ liệu đã thay đổi, vui lòng tải lại và thử lại", code: "CONFLICT" }, { status: 409 });
    const availabilityError = powderAvailabilityErrorResponse(error);
    if (availabilityError) return availabilityError;
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Bột không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    console.error("[DELETE /api/admin/powders/[id]] Error:", error instanceof Error ? error.message : error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Bột không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
