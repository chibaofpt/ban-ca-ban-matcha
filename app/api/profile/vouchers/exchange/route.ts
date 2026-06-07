/**
 * POST /api/profile/vouchers/exchange
 *
 * Spend points to purchase a voucher package.
 * Deducts points_balance, creates a Voucher, logs to points_log.
 * All writes in a single prisma.$transaction().
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const exchangeSchema = z.object({
  package_id: z.string().uuid(),
});

/** POST /api/profile/vouchers/exchange — Redeem points for a voucher package. */
export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const { package_id } = parsed.data;

    // 3. Read: validate package + user balance
    const [pkg, user] = await Promise.all([
      prisma.voucherPackage.findUnique({ where: { id: package_id } }),
      prisma.user.findUnique({
        where: { id: session.id },
        select: { points_balance: true },
      }),
    ]);

    if (!pkg || !pkg.is_active) {
      return NextResponse.json(
        { error: "Voucher package not found or inactive", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (user.points_balance < pkg.points_cost) {
      return NextResponse.json(
        {
          error: `Insufficient points. Required: ${pkg.points_cost}, available: ${user.points_balance}`,
          code: "INSUFFICIENT_POINTS",
        },
        { status: 422 }
      );
    }

    // Check total quantity limit (NULL = unlimited)
    if (pkg.quantity !== null) {
      const issuedCount = await prisma.voucher.count({ where: { package_id: pkg.id } });
      if (issuedCount >= pkg.quantity) {
        return NextResponse.json(
          { error: "This voucher package is sold out", code: "VOUCHER_SOLD_OUT" },
          { status: 422 }
        );
      }
    }

    // Check per-user limit
    const userIssuedCount = await prisma.voucher.count({
      where: { package_id: pkg.id, user_id: session.id },
    });
    if (userIssuedCount >= pkg.max_per_user) {
      return NextResponse.json(
        {
          error: `You have already redeemed the maximum allowed vouchers from this package (${pkg.max_per_user})`,
          code: "VOUCHER_LIMIT_REACHED",
        },
        { status: 422 }
      );
    }

    // 4. Compute expiry
    const expires_at =
      pkg.expires_after_days !== null
        ? new Date(Date.now() + pkg.expires_after_days * 24 * 60 * 60 * 1000)
        : null;

    // 5. Write: deduct points + create voucher + log — all atomic
    const voucher = await prisma.$transaction(
      async (tx) => {
        // Deduct points
        await tx.user.update({
          where: { id: session.id },
          data: { points_balance: { decrement: pkg.points_cost } },
        });

        // Create voucher instance — snapshot all fields from package
        const newVoucher = await tx.voucher.create({
          data: {
            user_id: session.id,
            package_id: pkg.id,
            voucher_type: pkg.voucher_type,
            discount_type: pkg.discount_type,
            discount_value: pkg.discount_value,
            menu_item_id: pkg.menu_item_id,
            size: pkg.size,
            matcha_powder_id: pkg.matcha_powder_id,
            milk_type_id: pkg.milk_type_id,
            included_addon_option_ids: pkg.included_addon_option_ids,
            addon_option_id: pkg.addon_option_id,
            covered_price_vnd: pkg.covered_price_vnd,
            covered_delivery_fee_vnd: pkg.covered_delivery_fee_vnd,
            min_order_vnd: pkg.min_order_vnd,
            status: "ACTIVE",
            expires_at,
          },
        });

        // Log points deduction
        await tx.pointsLog.create({
          data: {
            user_id: session.id,
            delta: -pkg.points_cost,
            reason: "voucher_purchase",
            voucher_id: newVoucher.id,
            performed_by: null,
            order_id: null,
          },
        });

        return newVoucher;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    return NextResponse.json(
      {
        data: {
          id: voucher.id,
          qr_token: voucher.qr_token,
          voucher_type: voucher.voucher_type,
          status: voucher.status,
          expires_at: voucher.expires_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/profile/vouchers/exchange]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
