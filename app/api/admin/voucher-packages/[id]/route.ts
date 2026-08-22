/**
 * PUT /api/admin/voucher-packages/[id] — Update a voucher package
 * DELETE /api/admin/voucher-packages/[id] — Deactivate (soft delete) a voucher package
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidateVoucherCaches } from "@/lib/cacheInvalidation";
import {
  loadVoucherAvailabilityCatalog,
  resolveVoucherTargetAvailability,
  type VoucherAvailabilityDatabase,
  type VoucherBundleRuleSource,
} from "@/lib/voucherAvailability";

export const dynamic = "force-dynamic";

const updatePackageSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

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

    if (parsed.data.is_active === true) {
      const target = await prisma.voucherPackage.findUnique({
        where: { id },
        select: {
          voucher_type: true,
          menu_item_id: true,
          size: true,
          matcha_powder_id: true,
          milk_type_id: true,
          addon_option_id: true,
          addonOption: {
            select: { is_active: true, gram_value: true, group: { select: { is_active: true } } },
          },
          bundleRule: {
            include: { productScopes: { include: { sizes: true } }, addonRewards: true },
          },
        },
      });
      if (
        target?.voucher_type === "ADDON" &&
        (!target.addonOption || !target.addonOption.is_active || !target.addonOption.group.is_active || target.addonOption.gram_value !== null)
      ) {
        return NextResponse.json(
          { error: "Không thể kích hoạt package trỏ tới addon không hợp lệ", code: "VALIDATION_ERROR" },
          { status: 400 },
        );
      }
      if (target && ["ITEM", "PRODUCT", "ADDON", "BUNDLE"].includes(target.voucher_type)) {
        const catalog = await loadVoucherAvailabilityCatalog(prisma as unknown as VoucherAvailabilityDatabase);
        const resolved = resolveVoucherTargetAvailability({
          voucher_type: target.voucher_type,
          menu_item_id: target.menu_item_id,
          size: target.size,
          matcha_powder_id: target.matcha_powder_id,
          milk_type_id: target.milk_type_id,
          addon_option_id: target.addon_option_id,
          package: { bundleRule: target.bundleRule as unknown as VoucherBundleRuleSource | null },
        }, catalog);
        if (!resolved.availability.can_apply) {
          return NextResponse.json(
            { error: `Không thể kích hoạt package ${target.voucher_type} vì target hiện không khả dụng`, code: "BUSINESS_RULE_VIOLATION", details: { reason: resolved.availability.status } },
            { status: 422 },
          );
        }
      }
    }

    const updated = await prisma.voucherPackage.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
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
