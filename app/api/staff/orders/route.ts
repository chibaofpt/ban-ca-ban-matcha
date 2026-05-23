import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, normalizePhone } from "@/lib/auth";
import { staffOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** POST /api/staff/orders — create a counter order (status = COMPLETED immediately) */
export async function POST(req: NextRequest) {
  // 1. Parse body
  const body = await req.json().catch(() => null);

  // 2. Zod validate
  const parsed = staffOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // 3. Session check
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // 4. Role check
  if (!["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const data = parsed.data;
    const isAnonymous = !data.phone_number;

    // 5. Guard: anonymous orders may not carry vouchers
    if (isAnonymous && data.voucher_id) {
      return NextResponse.json(
        { error: "Voucher cannot be applied to anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (isAnonymous && data.items.some((i) => i.product_voucher_id)) {
      return NextResponse.json(
        { error: "Product voucher cannot be used for anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // ── Phase 1: READS (outside transaction — avoids P2028 pgBouncer timeout) ──

    // Step 1: Resolve user (read-only) — skip entirely for anonymous
    let existingUser: { id: string } | null = null;

    if (!isAnonymous) {
      const normalizedPhone = normalizePhone(data.phone_number!);
      existingUser = await prisma.user.findUnique({
        where: { phone_number: normalizedPhone },
        select: { id: true },
      });

      if (!existingUser && !data.customer_name) {
        return NextResponse.json(
          { error: "customer_name required for new phone number", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
    }

    // Step 2: Validate + price-check all items (reads from DB, no writes)
    const resolvedItems = await processOrderItems(data.items, prisma);

    // Step 3: Calculate totals
    const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);
    let discount_vnd = 0;
    let voucher_id: string | null = null;

    if (data.voucher_id) {
      const voucher = await prisma.voucher.findUnique({ where: { id: data.voucher_id } });
      if (
        voucher &&
        voucher.status === "ACTIVE" &&
        voucher.voucher_type === "DISCOUNT" &&
        (voucher.expires_at === null || voucher.expires_at > new Date())
      ) {
        voucher_id = voucher.id;
        if (voucher.discount_type === "PERCENT" && voucher.discount_value !== null) {
          discount_vnd = Math.floor((subtotal_vnd * voucher.discount_value) / 100);
        } else if (voucher.discount_type === "FIXED" && voucher.discount_value !== null) {
          discount_vnd = voucher.discount_value;
        }
      }
    }

    const total_vnd = Math.max(0, subtotal_vnd - discount_vnd);
    // Anonymous orders never earn points
    const points_earned = isAnonymous ? 0 : Math.floor(total_vnd / 10000);

    // ── Phase 2: WRITES only (short transaction — pgBouncer compatible) ──────
    const order = await prisma.$transaction(
      async (tx) => {
        // Resolve or create user only for non-anonymous orders
        let userId: string | null = existingUser?.id ?? null;

        if (!isAnonymous && !userId) {
          const normalizedPhone = normalizePhone(data.phone_number!);
          const newUser = await tx.user.create({
            data: {
              phone_number: normalizedPhone,
              name: data.customer_name!,
              password_hash: "GHOST_USER_NO_PASSWORD",
              role: "CUSTOMER",
              qr_token: crypto.randomUUID(),
            },
          });
          userId = newUser.id;
        }

        // Insert order + items + addons
        const createdOrder = await tx.order.create({
          data: {
            user_id: userId,       // null for anonymous orders
            handled_by: session.id,
            voucher_id,
            status: "COMPLETED",
            subtotal_vnd,
            discount_vnd,
            total_vnd,
            points_earned,
            pickup_time: null,
            note: null,
            items: {
              create: resolvedItems.map((item) => ({
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                size: item.size,
                unit_price_vnd: item.unit_price_vnd,
                addons_price_vnd: item.addons_price_vnd,
                sweetness: item.sweetness as SweetnessLevel,
                ice_option: item.ice_option as IceOption,
                coldwhisk: item.coldwhisk,
                note: item.note,
                product_voucher_id: item.product_voucher_id,
                selected_powder_id: item.selected_powder_id,
                selected_milk_type_id: item.selected_milk_type_id,
                addons: {
                  create: item.resolvedAddons.map((a) => ({
                    addon_option_id: a.addon_option_id,
                    quantity: a.quantity,
                    unit_price_vnd: a.unit_price_vnd,
                  })),
                },
              })),
            },
          },
        });

        // Mark voucher as redeemed
        if (voucher_id) {
          await tx.voucher.update({
            where: { id: voucher_id },
            data: {
              status: "REDEEMED",
              used_channel: "ONLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // Award points only for orders with a known user
        if (userId && points_earned > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { points_balance: { increment: points_earned } },
          });

          await tx.pointsLog.create({
            data: {
              user_id: userId,
              delta: points_earned,
              reason: "order_complete",
              order_id: createdOrder.id,
              performed_by: null,
              voucher_id: null,
            },
          });
        }

        return createdOrder;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    return NextResponse.json(
      {
        data: {
          id: order.id,
          status: order.status,
          total_vnd: order.total_vnd,
          points_earned: order.points_earned,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof OrderValidationError) {
      const statusMap: Record<string, number> = {
        VALIDATION_ERROR: 400,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
      };
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: statusMap[err.code] ?? 400 }
      );
    }

    if (err instanceof PriceChangedError) {
      return NextResponse.json(
        {
          error: "One or more item prices have changed. Please review and resubmit.",
          code: "PRICE_CHANGED",
          details: { conflicts: err.conflicts },
        },
        { status: 409 }
      );
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const errName = err instanceof Error ? err.name : typeof err;
    console.error("[POST /api/staff/orders] UNHANDLED ERROR:", { name: errName, message: errMsg, stack: errStack });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/staff/orders — List orders for the staff/admin orders page.
 *
 * Query params:
 *   order_type: Comma-separated values: "COUNTER", "PICKUP", "DELIVERY"
 *               Omit to return all types.
 *   status:     Single status filter: "PENDING" (ADMIN only — for "Chờ CK" tab).
 *               Omit to return all non-PENDING statuses for PICKUP/DELIVERY,
 *               or all statuses for COUNTER.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !['STAFF', 'ADMIN'].includes(session.role)) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const orderTypeParam = searchParams.get('order_type'); // e.g. "COUNTER" or "PICKUP,DELIVERY"
  const statusParam = searchParams.get('status');        // e.g. "PENDING"

  // Only ADMIN can access the "Chờ CK" tab (PENDING customer orders)
  if (statusParam === 'PENDING' && session.role === 'STAFF') {
    return NextResponse.json(
      { error: 'Forbidden — only ADMIN can view pending payment orders', code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  try {
    // Build dynamic where clause
    const where: Record<string, unknown> = {};

    // Filter by order_type
    if (orderTypeParam) {
      const types = orderTypeParam.split(',').map((t) => t.trim()) as ('COUNTER' | 'PICKUP' | 'DELIVERY')[];
      where.order_type = { in: types };
    }

    if (statusParam === 'PENDING') {
      // "Chờ CK" tab: admin-only, show all PENDING customer orders
      where.status = 'PENDING';
    } else if (orderTypeParam && !orderTypeParam.includes('COUNTER')) {
      // "Khách đặt" tab: show PICKUP/DELIVERY orders that have passed PENDING
      where.status = { in: ['ADMIN_CONFIRMED', 'STAFF_DONE', 'COMPLETED', 'CANCELLED'] };
    }
    // No status filter for COUNTER (show all — COMPLETED, CANCELLED)

    const orders = await prisma.order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { name: true, phone_number: true } },
        items: {
          include: {
            menuItem: { select: { name: true, category: true } },
            selectedPowder: { select: { name: true, price_per_gram: true } },
            milkType: { select: { name: true, is_default: true } },
            addons: {
              include: {
                addonOption: {
                  select: {
                    label: true,
                    gram_value: true,
                    price_vnd: true,
                    group: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Lazy auto-cancel: expire any PENDING orders that have passed their deadline.
    // Only relevant when fetching PENDING orders ("Chờ CK" tab).
    if (statusParam === 'PENDING') {
      const now = new Date();
      const expiredIds = orders
        .filter((o) => o.status === 'PENDING' && o.auto_cancel_at && o.auto_cancel_at <= now)
        .map((o) => o.id);

      if (expiredIds.length > 0) {
        // Batch-cancel expired orders (individual transactions for atomicity with vouchers)
        await Promise.all(
          expiredIds.map(async (orderId) => {
            const expired = orders.find((o) => o.id === orderId);
            if (!expired) return;
            await prisma.$transaction(
              async (tx) => {
                await tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
                if (expired.voucher_id) {
                  await tx.voucher.update({
                    where: { id: expired.voucher_id },
                    data: { status: 'ACTIVE' },
                  });
                }
              },
              { maxWait: 5000, timeout: 10000 }
            );
            // Update in-memory for response
            expired.status = 'CANCELLED';
          })
        );
      }
    }

    return NextResponse.json({ data: orders });
  } catch (err) {
    console.error('[GET /api/staff/orders]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
