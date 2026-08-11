import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({ is_active: z.boolean() }).strict();

/** PATCH /api/admin/promotions/[id] — Toggle a campaign without mutating published rules. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  const { id } = await params;
  try {
    const promotion = await prisma.promotion.update({
      where: { id },
      data: { is_active: parsed.data.is_active },
      select: { id: true, title: true, is_active: true },
    });
    return NextResponse.json({ data: promotion });
  } catch (error) {
    console.error("[PATCH /api/admin/promotions/[id]]", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "Promotion not found", code: "NOT_FOUND" }, { status: 404 });
  }
}
