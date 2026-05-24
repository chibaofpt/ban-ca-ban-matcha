/**
 * POST /api/profile/vouchers/refund
 *
 * Auto-refund: triggered when the menu item in a PRODUCT voucher is no longer available.
 * User cannot call this for any other reason.
 * Checks is_available === false, then refunds full points_cost and marks REFUNDED.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const refundSchema = z.object({
  /** qr_token of the voucher to refund (never expose id) */
  qr_token: z.string().min(1),
});

/** POST /api/profile/vouchers/refund — Auto-refund a PRODUCT voucher when its item is unavailable. */
export async function POST(req: NextRequest) {
  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // 2. Parse body
  const body = await req.json().catch(() => null);
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const { qr_token } = parsed.data;

    // 3. Fetch voucher by qr_token
    const voucher = await prisma.voucher.findUnique({
      where: { qr_token },
      include: { package: true },
    });

    if (!voucher || voucher.user_id !== session.id) {
      return NextResponse.json(
        { error: "Voucher not found or does not belong to you", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // 4. Only PRODUCT vouchers can be auto-refunded
    if (voucher.voucher_type !== "PRODUCT") {
      return NextResponse.json(
        {
          error: "Only PRODUCT vouchers can be auto-refunded when the item is unavailable",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    // 5. Voucher must be ACTIVE to be refunded
    if (voucher.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: `Voucher cannot be refunded in status: ${voucher.status}`,
          code: "CONFLICT",
        },
        { status: 409 }
      );
    }

    // 6. The linked menu item must be unavailable (is_available = false)
    if (!voucher.menu_item_id) {
      return NextResponse.json(
        { error: "PRODUCT voucher has no associated menu item", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const menuItem = await prisma.menuItem.findUnique({
      where: { id: voucher.menu_item_id },
      select: { is_available: true, name: true },
    });

    if (!menuItem) {
      // Item deleted entirely — refund is allowed
    } else if (menuItem.is_available) {
      return NextResponse.json(
        {
          error: `Item "${menuItem.name}" is still available. Refund only allowed when item is no longer sold.`,
          code: "CONFLICT",
        },
        { status: 409 }
      );
    }

    const points_cost = voucher.package.points_cost;

    // 7. Atomic: mark REFUNDED + restore points + log
    await prisma.$transaction(
      async (tx) => {
        await tx.voucher.update({
          where: { id: voucher.id },
          data: { status: "REFUNDED" },
        });

        await tx.user.update({
          where: { id: session.id },
          data: { points_balance: { increment: points_cost } },
        });

        await tx.pointsLog.create({
          data: {
            user_id: session.id,
            delta: points_cost,
            reason: "voucher_refund",
            voucher_id: voucher.id,
            performed_by: null,
            order_id: null,
          },
        });
      },
      { maxWait: 5000, timeout: 10000 }
    );

    return NextResponse.json(
      {
        data: {
          qr_token: voucher.qr_token,
          status: "REFUNDED",
          points_refunded: points_cost,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[POST /api/profile/vouchers/refund]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
