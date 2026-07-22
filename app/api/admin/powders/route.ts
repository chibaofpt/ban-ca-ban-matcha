import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createPowderSchema } from "@/lib/validations/powder";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const powders = await prisma.matchaPowder.findMany({
      include: {
        powderSizeConfigs: true,
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = powders.map((p) => ({
      ...p,
      size_config: p.powderSizeConfigs.map((c) => ({
        size: c.size,
        grams: Number(c.grams),
      })),
      powderSizeConfigs: undefined,
    }));

    return NextResponse.json({ data: mapped });
  } catch (error: unknown) {
    console.error("[GET /api/admin/powders] Error:", error instanceof Error ? error.message : error);
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
    const validation = createPowderSchema.safeParse(raw);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      // Create the powder
      const powder = await tx.matchaPowder.create({
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

      // Create size_config if provided
      if (validData.size_config && validData.size_config.length > 0) {
        await tx.powderSizeConfig.createMany({
          data: validData.size_config.map((sc) => ({
            powder_id: powder.id,
            size: sc.size,
            grams: sc.grams,
          })),
        });
      }

      return tx.matchaPowder.findUniqueOrThrow({
        where: { id: powder.id },
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
    return NextResponse.json({ data: mappedResult }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/admin/powders] Error:", error instanceof Error ? error.message : error);
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
