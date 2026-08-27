/**
 * GET /api/profile/vouchers — List all vouchers belonging to the current user.
 * Returns all statuses (ACTIVE, RESERVED, REDEEMED, EXPIRED, REFUNDED)
 * ordered by created_at desc, newest first.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma, VoucherStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";
import { attachBundleRewardBaselines } from "@/lib/voucherBundleDto";
import {
  attachOwnedVoucherAvailability,
  loadVoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";

export const dynamic = "force-dynamic";

function decodeCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/** GET /api/profile/vouchers — Returns a bounded cursor page of the current user's vouchers. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limitValue = Number(searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitValue) && limitValue >= 1 && limitValue <= 50
      ? limitValue
      : null;
    const cursor = searchParams.get("cursor");
    const cursorId = cursor ? decodeCursor(cursor) : null;
    const status = searchParams.get("status") as VoucherStatus | null;
    const validStatuses: VoucherStatus[] = ["ACTIVE", "RESERVED", "REDEEMED", "EXPIRED", "REFUNDED"];
    if (!limit || (cursor && !cursorId) || (status && !validStatuses.includes(status))) {
      return NextResponse.json(
        { error: "Invalid pagination", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const now = new Date();
    const lifecycleWhere: Prisma.VoucherWhereInput = status === "ACTIVE"
      ? { status: "ACTIVE", OR: [{ expires_at: null }, { expires_at: { gt: now } }] }
      : status === "EXPIRED"
        ? {
            OR: [
              { status: "EXPIRED" },
              { status: "ACTIVE", expires_at: { lte: now } },
            ],
          }
        : status
          ? { status }
          : {};

    const vouchers = await prisma.voucher.findMany({
      where: { user_id: session.id, ...lifecycleWhere },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        package: {
          select: {
            name: true,
            description: true,
            points_cost: true,
            acquisition_mode: true,
            ends_at: true,
            bundleRule: {
              select: {
                buy_quantity: true,
                reward_quantity: true,
                reward_kind: true,
                reward_mode: true,
                benefit_scaling: true,
                max_applications_order: true,
                max_reward_units_order: true,
                productScopes: {
                  select: {
                    role: true,
                    menu_item_id: true,
                    default_powder_id: true,
                    default_base_liquid_id: true,
                    sizes: { select: { size: true } },
                    menuItem: { select: { name: true, category: true, is_available: true } },
                  },
                },
                addonRewards: { select: { addon_option_id: true } },
              },
            },
          },
        },
        menuItem: { select: { name: true, is_available: true } },
        menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
        addonOption: { select: { label: true } },
        // Staff who redeemed it offline (null = redeemed by the user themselves online)
        staff: { select: { name: true, role: true } },
        pointsLogs: {
          where: { reason: "voucher_purchase" },
          select: { delta: true, reason: true },
          take: 1,
        },
      },
    });

    const hasMore = vouchers.length > limit;
    const page = vouchers.slice(0, limit);
    const catalog = await loadVoucherAvailabilityCatalog(prisma as unknown as VoucherAvailabilityDatabase);
    const withAvailability = attachOwnedVoucherAvailability(page, catalog);
    const withBaselines = await attachBundleRewardBaselines(prisma, withAvailability);
    const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].id) : null;
    return NextResponse.json({
      data: withBaselines.map((voucher) => {
        const dto = toPublicVoucherDto(voucher);
        return voucher.status === "ACTIVE" && voucher.expires_at && voucher.expires_at <= now
          ? { ...dto, status: "EXPIRED" as const }
          : dto;
      }),
      meta: { limit, has_more: hasMore, next_cursor: nextCursor },
    });
  } catch (err) {
    console.error("[GET /api/profile/vouchers]", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
