import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePowderSchema } from "@/lib/validations/powder";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const raw = await req.json();

    // Support quick toggle of is_available
    if (Object.keys(raw).length === 1 && "is_available" in raw) {
      if (typeof raw.is_available !== "boolean") {
        return NextResponse.json({ error: "is_available must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      let disabledLatteId: string | undefined;

      const updated = await prisma.$transaction(async (tx) => {
        const powder = await tx.matchaPowder.update({
          where: { id },
          data: { is_available: raw.is_available },
          include: { powderSizeConfigs: true },
        });

        // Cascade: sync latte anchor cùng trạng thái với powder
        if (powder.reference_latte_item_id) {
          await tx.menuItem.update({
            where: { id: powder.reference_latte_item_id },
            data: { is_available: raw.is_available, updated_at: new Date() },
          });
          if (!raw.is_available) disabledLatteId = powder.reference_latte_item_id;
        }

        return powder;
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

    const result = await prisma.$transaction(async (tx) => {
      // Find existing
      const existing = await tx.matchaPowder.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      // Update powder details
      await tx.matchaPowder.update({
        where: { id },
        data: {
          name: validData.name,
          manufacturer: validData.manufacturer,
          description: validData.description,
          price_per_gram: validData.price_per_gram,
          type: validData.type,
          reference_latte_item_id: validData.reference_latte_item_id,
          fragrance: validData.fragrance,
          body: validData.body,
          bitterness: validData.bitterness,
          umami: validData.umami,
          color: validData.color,
          is_available: validData.is_available,
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

    const mappedResult = {
      ...result,
      size_config: result.powderSizeConfigs.map((c) => ({
        size: c.size,
        grams: Number(c.grams),
      })),
      powderSizeConfigs: undefined,
    };

    await invalidateMenuCaches();
    return NextResponse.json({ data: mappedResult });
  } catch (error: unknown) {
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

    let disabledLatteId: string | undefined;

    // Soft delete + cascade
    const updated = await prisma.$transaction(async (tx) => {
      const powder = await tx.matchaPowder.update({
        where: { id },
        data: { is_available: false },
      });

      // Cascade: inactive latte anchor khi powder bị xoá mềm
      if (powder.reference_latte_item_id) {
        await tx.menuItem.update({
          where: { id: powder.reference_latte_item_id },
          data: { is_available: false, updated_at: new Date() },
        });
        disabledLatteId = powder.reference_latte_item_id;
      }

      return powder;
    });

    await invalidateMenuCaches();
    return NextResponse.json({
      data: {
        ...updated,
        ...(disabledLatteId !== undefined && { disabled_latte_id: disabledLatteId }),
      },
    });
  } catch (error: unknown) {
    console.error("[DELETE /api/admin/powders/[id]] Error:", error instanceof Error ? error.message : error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Bột không tồn tại", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
