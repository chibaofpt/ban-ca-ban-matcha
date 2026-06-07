import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addressSchema } from "@/lib/validations/address";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.address.findUnique({
      where: { id },
    });

    if (!existing || existing.user_id !== session.id) {
      return NextResponse.json({ error: "Address not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = addressSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", code: "VALIDATION_ERROR", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const shouldBeDefault = parsed.data.is_default;

    const address = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault && !existing.is_default) {
        await tx.address.updateMany({
          where: { user_id: session.id, is_default: true },
          data: { is_default: false },
        });
      }

      // If user tries to unset default, but it's the only one or they just want no defaults?
      // Business rule: one default is nice to have, but we let them unset if they want, 
      // though typically they just set another as default. For simplicity, just follow input.
      return tx.address.update({
        where: { id },
        data: {
          ...parsed.data,
        },
      });
    });

    return NextResponse.json({ data: address });
  } catch (error) {
    console.error("[PUT /api/profile/addresses/:id] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.address.findUnique({
      where: { id },
    });

    if (!existing || existing.user_id !== session.id) {
      return NextResponse.json({ error: "Address not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (existing.is_default) {
        // If we deleted the default, assign default to the most recent one if exists
        const nextAddress = await tx.address.findFirst({
          where: { user_id: session.id },
          orderBy: { created_at: "desc" },
        });

        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { is_default: true },
          });
        }
      }
    });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("[DELETE /api/profile/addresses/:id] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
