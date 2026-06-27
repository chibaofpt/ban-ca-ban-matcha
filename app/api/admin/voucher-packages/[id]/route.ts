/**
 * PUT /api/admin/voucher-packages/[id] — Update a voucher package
 * DELETE /api/admin/voucher-packages/[id] — Deactivate (soft delete) a voucher package
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidateVoucherCaches } from "@/lib/cacheInvalidation";

export const dynamic = "force-dynamic";

const updatePackageSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  points_cost: z.number().int().min(1).optional(),
  expires_after_days: z.number().int().min(1).nullable().optional(),
  quantity: z.number().int().min(1).nullable().optional(),
  max_per_user: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
});

/** PUT /api/admin/voucher-packages/[id] — Update editable fields. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updatePackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.voucherPackage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Voucher package not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const updated = await prisma.voucherPackage.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.points_cost !== undefined && { points_cost: parsed.data.points_cost }),
        ...(parsed.data.expires_after_days !== undefined && { expires_after_days: parsed.data.expires_after_days }),
        ...(parsed.data.quantity !== undefined && { quantity: parsed.data.quantity }),
        ...(parsed.data.max_per_user !== undefined && { max_per_user: parsed.data.max_per_user }),
        ...(parsed.data.is_active !== undefined && { is_active: parsed.data.is_active }),
      },
    });

    await invalidateVoucherCaches();
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PUT /api/admin/voucher-packages/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/** DELETE /api/admin/voucher-packages/[id] — Deactivate (is_active = false). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.voucherPackage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Voucher package not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    await prisma.voucherPackage.update({
      where: { id },
      data: { is_active: false },
    });

    await invalidateVoucherCaches();
    return NextResponse.json({ data: { id, is_active: false } });
  } catch (err) {
    console.error("[DELETE /api/admin/voucher-packages/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
