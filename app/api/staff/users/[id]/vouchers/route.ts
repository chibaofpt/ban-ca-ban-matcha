/**
 * GET /api/staff/users/[id]/vouchers — List ACTIVE vouchers of a customer.
 * Auth: STAFF or ADMIN only.
 * Returns empty array for unknown user_id (no 404 — prevents info leak).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { resolveCustomerIdentifier } from "@/lib/publicIdentifiers";
import { toPublicVoucherDto } from "@/lib/voucherPublicDto";
import { attachBundleRewardBaselines } from "@/lib/voucherBundleDto";
import {
  attachOwnedVoucherAvailability,
  loadVoucherAvailabilityCatalog,
  type VoucherAvailabilityDatabase,
} from "@/lib/voucherAvailability";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

export const dynamic = "force-dynamic";

/** GET /api/staff/users/[id]/vouchers — Returns all ACTIVE vouchers for the given customer. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const { id: userIdentifier } = await params;

  try {
    const user = await resolveCustomerIdentifier(userIdentifier);
    if (!user) return NextResponse.json({ data: [] });

    const userId = user.id;
    await ensureAutoGrantedVouchers(prisma as unknown as VoucherIssuanceDatabase, userId);
    await lazyExpireVouchers(userId);
    const vouchers = await prisma.voucher.findMany({
      where: {
        user_id: userId,
        status: "ACTIVE",
      },
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
        addonOption: { select: { label: true } },
        staff: { select: { name: true, role: true } },
        pointsLogs: {
          where: { reason: "voucher_purchase" },
          select: { delta: true, reason: true },
          take: 1,
        },
      },
    });

    const catalog = await loadVoucherAvailabilityCatalog(prisma as unknown as VoucherAvailabilityDatabase);
    const withAvailability = attachOwnedVoucherAvailability(vouchers, catalog);
    const withBaselines = await attachBundleRewardBaselines(prisma, withAvailability);
    return NextResponse.json({ data: withBaselines.map(toPublicVoucherDto) });
  } catch (err) {
    console.error("[GET /api/staff/users/[id]/vouchers]", {
      name: err instanceof Error ? err.name : typeof err,
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
