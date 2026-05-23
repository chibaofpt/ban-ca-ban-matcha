import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { customerOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import { generateOrderCode } from "@/lib/orderCode";
import { buildVietQRUrl } from "@/lib/vietqr";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";

export const dynamic = "force-dynamic";

/** Deadline in minutes before a PENDING PICKUP/DELIVERY order is auto-cancelled. */
const AUTO_CANCEL_MINUTES = 20;

/** POST /api/orders — Customer places a PICKUP/DELIVERY order. Returns payment QR. */
export async function POST(req: NextRequest) {
  // 1. Parse body
  const body = await req.json().catch(() => null);

  // 2. Zod validate
  const parsed = customerOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // 3. Session check — user_id always from JWT, never from body
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // 4. Role check — only CUSTOMER can use this endpoint
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const data = parsed.data;

    // ── Phase 1: READS (outside transaction — avoids P2028 pgBouncer timeout) ──

    // Step 1: Process items — validate, price-check, resolve addons (reads only)
    const resolvedItems = await processOrderItems(data.items, prisma);

    // Step 2: Calculate subtotal
    const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);
    let discount_vnd = 0;
    let voucher_id: string | null = null;

    // Step 3: Validate voucher (read-only)
    if (data.voucher_id) {
      const voucher = await prisma.voucher.findUnique({ where: { id: data.voucher_id } });

      if (!voucher || voucher.user_id !== session.id) {
        return NextResponse.json(
          { error: "Voucher not found or does not belong to you", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      if (voucher.status === "REDEEMED") {
        return NextResponse.json(
          { error: "Voucher has already been used", code: "VOUCHER_REDEEMED" },
          { status: 422 }
        );
      }
      if (voucher.status === "RESERVED") {
        return NextResponse.json(
          { error: "Voucher is already reserved for another pending order", code: "VOUCHER_RESERVED" },
          { status: 422 }
        );
      }
      if (voucher.expires_at !== null && voucher.expires_at <= new Date()) {
        return NextResponse.json(
          { error: "Voucher has expired", code: "VOUCHER_EXPIRED" },
          { status: 422 }
        );
      }
      if (voucher.voucher_type !== "DISCOUNT") {
        return NextResponse.json(
          { error: "Voucher is not a discount voucher", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      voucher_id = voucher.id;
      if (voucher.discount_type === "PERCENT" && voucher.discount_value !== null) {
        discount_vnd = Math.floor((subtotal_vnd * voucher.discount_value) / 100);
      } else if (voucher.discount_type === "FIXED" && voucher.discount_value !== null) {
        discount_vnd = Math.min(voucher.discount_value, subtotal_vnd);
      }
    }

    const total_vnd = Math.max(0, subtotal_vnd - discount_vnd);

    // Step 4: Generate unique order code (read — collision check)
    const order_code = await generateOrderCode(prisma);

    // Step 5: Compute auto-cancel deadline
    const auto_cancel_at = new Date(Date.now() + AUTO_CANCEL_MINUTES * 60 * 1000);

    // ── Phase 2: WRITES only (short transaction — pgBouncer compatible) ──────
    const order = await prisma.$transaction(
      async (tx) => {
        // Insert order + items + addons
        const createdOrder = await tx.order.create({
          data: {
            user_id: session.id,
            voucher_id,
            status: "PENDING",
            order_type: data.order_type,
            order_code,
            subtotal_vnd,
            discount_vnd,
            total_vnd,
            points_earned: null,
            pickup_time: data.pickup_time ? new Date(data.pickup_time) : null,
            note: data.note ?? null,
            auto_cancel_at,
            delivery_address: data.delivery_address ?? null,
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

        // Reserve voucher — will become REDEEMED only after admin confirms payment
        if (voucher_id) {
          await tx.voucher.update({
            where: { id: voucher_id },
            data: { status: "RESERVED" },
          });
        }

        return createdOrder;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    // Step 6: Build VietQR payment URL (outside transaction — no DB needed)
    const payment_qr_url = buildVietQRUrl({ amount: total_vnd, orderCode: order_code });

    return NextResponse.json(
      {
        data: {
          id: order.id,
          order_code: order.order_code,
          status: order.status,
          order_type: order.order_type,
          subtotal_vnd: order.subtotal_vnd,
          discount_vnd: order.discount_vnd,
          total_vnd: order.total_vnd,
          pickup_time: order.pickup_time,
          auto_cancel_at: order.auto_cancel_at,
          payment_qr_url,
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
    console.error("[POST /api/orders] UNHANDLED ERROR:", { name: errName, message: errMsg, stack: errStack });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/** GET /api/orders — Customer gets their order history */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { user_id: session.id },
      orderBy: { created_at: "desc" },
      include: {
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

    // Build payment_qr_url for each PENDING order
    const data = orders.map((order) => {
      let payment_qr_url: string | null = null;
      if (order.status === "PENDING" && order.order_code && order.order_type !== "COUNTER") {
        try {
          payment_qr_url = buildVietQRUrl({ amount: order.total_vnd, orderCode: order.order_code });
        } catch {
          payment_qr_url = null;
        }
      }
      return { ...order, payment_qr_url };
    });

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
