import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMilkTypeSchema } from "@/lib/validations/milkType";
import { invalidateMenuCaches } from "@/lib/cacheInvalidation";

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

  try {
    const raw = await req.json();
    const validation = createMilkTypeSchema.safeParse(raw);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const validData = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      if (validData.is_default) {
        // Unset any existing default
        await tx.milkType.updateMany({
          where: { is_default: true },
          data: { is_default: false },
        });
      }

      // Find max display_order
      const maxOrder = await tx.milkType.aggregate({
        _max: { display_order: true },
      });
      const nextDisplayOrder = (maxOrder._max.display_order ?? 0) + 1;

      // Create the milk type
      return tx.milkType.create({
        data: {
          name: validData.name,
          price_per_ml: validData.price_per_ml,
          is_default: validData.is_default,
          is_active: validData.is_active,
          display_order: nextDisplayOrder,
        },
      });
    });

    await invalidateMenuCaches();
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/admin/milk-types] Error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Internal Server Error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
