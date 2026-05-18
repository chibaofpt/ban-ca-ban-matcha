import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, normalizePhone } from "@/lib/auth";
import { staffOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";

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
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // 4. Role check
  if (!["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  // 5. Business logic — everything inside a single transaction
  try {
    const data = parsed.data;

    const order = await prisma.$transaction(async (tx) => {
      // ── Step 1: Normalize phone + resolve/create user ──────────────────────
      const normalizedPhone = normalizePhone(data.phone_number);

      let user = await tx.user.findUnique({
        where: { phone_number: normalizedPhone },
      });

      if (!user) {
        if (!data.customer_name) {
          throw new OrderValidationError(
            "VALIDATION_ERROR",
            "customer_name required for new phone number"
          );
        }
        user = await tx.user.create({
          data: {
            phone_number: normalizedPhone,
            name: data.customer_name,
            password_hash: "GHOST_USER_NO_PASSWORD",
            role: "CUSTOMER",
            qr_token: crypto.randomUUID(),
          },
        });
      }

      // ── Step 2: Process items — validate, price-check, resolve addons ──────
      const resolvedItems = await processOrderItems(data.items, tx);

      // ── Step 3: Calculate totals ───────────────────────────────────────────
      const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);
      let discount_vnd = 0;
      let voucher_id: string | null = null;

      if (data.voucher_id) {
        const voucher = await tx.voucher.findUnique({
          where: { id: data.voucher_id },
        });

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
      const points_earned = Math.floor(total_vnd / 10000);

      // ── Step 4: Insert order + items + addons ──────────────────────────────
      const createdOrder = await tx.order.create({
        data: {
          user_id: user.id,
          handled_by: session.id, // Counter order -> Handled by the staff who created it
          voucher_id,
          status: "COMPLETED", // staff counter order → COMPLETED immediately
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

      // ── Step 5: Mark voucher as redeemed ──────────────────────────────────
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

      // ── Step 6: Award points ───────────────────────────────────────────────
      await tx.user.update({
        where: { id: user.id },
        data: { points_balance: { increment: points_earned } },
      });

      if (points_earned > 0) {
        await tx.pointsLog.create({
          data: {
            user_id: user.id,
            delta: points_earned,
            reason: "order_complete",
            order_id: createdOrder.id,
            performed_by: null,
            voucher_id: null,
          },
        });
      }

      return createdOrder;
    });

    // 6. Return success — do NOT expose users.id
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

/** GET /api/staff/orders — List orders for this staff member */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["STAFF", "ADMIN"].includes(session.role)) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { handled_by: session.id },
          { status: "PENDING", handled_by: null },
        ],
      },
      orderBy: { created_at: "desc" },
      include: {
        user: { select: { name: true, phone_number: true } },
        items: {
          include: {
            menuItem: { select: { name: true } },
            addons: {
              include: {
                addonOption: { select: { label: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ data: orders });
  } catch (err) {
    console.error("[GET /api/staff/orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

