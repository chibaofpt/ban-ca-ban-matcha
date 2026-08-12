/**
 * GET /api/profile/vouchers — List all vouchers belonging to the current user.
 * Returns all statuses (ACTIVE, RESERVED, REDEEMED, EXPIRED, REFUNDED)
 * ordered by created_at desc, newest first.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

export const dynamic = "force-dynamic";

/** GET /api/profile/vouchers — Returns all vouchers belonging to the current user. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // Lazy retry closes the gap when registration-time grant lost a transient race.
    await ensureAutoGrantedVouchers(prisma as unknown as VoucherIssuanceDatabase, session.id);
    // Lazy-sync: mark expired vouchers before listing
    await lazyExpireVouchers(session.id);

    const vouchers = await prisma.voucher.findMany({
      where: { user_id: session.id },
      orderBy: { created_at: "desc" },
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
                productScopes: { select: { role: true, menu_item_id: true } },
                addonRewards: { select: { addon_option_id: true } },
              },
            },
          },
        },
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
        // Staff who redeemed it offline (null = redeemed by the user themselves online)
        staff: { select: { name: true, role: true } },
      },
    });

    return NextResponse.json({ data: vouchers.map(toPublicVoucherDto) });
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
