import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { customerOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { ProductVoucherInfo } from "@/lib/orders";
import {
  assertVoucherUsable,
  calcDiscountVoucher,
  calcProductVoucherSurplusPoints,
  findAddonVoucherDiscount,
  VoucherError,
} from "@/lib/vouchers";
import { generateOrderCode } from "@/lib/orderCode";
import { buildVietQRUrl } from "@/lib/vietqr";
import { checkStoreOpen, validatePickupTime } from "@/lib/storeSchedule";
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

    // 5. Store open check — reject PICKUP/DELIVERY when store is closed
    // COUNTER orders are only created by staff, not customers, but guard anyway.
    const storeStatus = await checkStoreOpen();
    if (!storeStatus.is_open) {
      return NextResponse.json(
        {
          error: storeStatus.closure_note
            ? `Cửa hàng tạm đóng cửa: ${storeStatus.closure_note}`
            : "Cửa hàng hiện đang đóng cửa, vui lòng đặt hàng trong giờ mở cửa",
          code: "STORE_CLOSED",
        },
        { status: 503 }
      );
    }

    // 5.1. Pickup time validation
    if (data.order_type === "PICKUP" || data.order_type === "DELIVERY") {
      const resolvedPickupTime = data.pickup_time
        ? new Date(data.pickup_time)
        : new Date(Date.now() + 10 * 60 * 1000);

      const pickupValidation = await validatePickupTime(resolvedPickupTime);
      if (!pickupValidation.isValid) {
        return NextResponse.json(
          { error: pickupValidation.error, code: "INVALID_PICKUP_TIME" },
          { status: 400 }
        );
      }
    }

    // ── Phase 1: READS (outside transaction — avoids P2028 pgBouncer timeout) ──

    // Step 1: Validate all PRODUCT vouchers BEFORE processOrderItems.
    // Checks: exists, belongs to user, status=ACTIVE, not expired, correct type, correct menu_item.
    const productVoucherMap = new Map<string, ProductVoucherInfo>();
    for (const item of data.items) {
      if (item.product_voucher_id) {
        if (productVoucherMap.has(item.product_voucher_id)) {
          // Same voucher on multiple items — reject (would allow double-use)
          return NextResponse.json(
            { error: "The same product voucher cannot be applied to multiple items", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        const pv = await prisma.voucher.findUnique({ where: { id: item.product_voucher_id } });
        try {
          assertVoucherUsable(pv, session.id, "PRODUCT");
        } catch (e) {
          if (e instanceof VoucherError) {
            const statusMap: Record<string, number> = {
              NOT_FOUND: 404, VOUCHER_REDEEMED: 422, VOUCHER_EXPIRED: 422, CONFLICT: 422,
              VALIDATION_ERROR: 400,
            };
            return NextResponse.json(
              { error: e.message, code: e.code },
              { status: statusMap[e.code] ?? 400 }
            );
          }
          throw e;
        }
        if (!pv!.covered_price_vnd || !pv!.menu_item_id) {
          return NextResponse.json(
            { error: "Product voucher is not properly configured", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        productVoucherMap.set(pv!.id, {
          menu_item_id: pv!.menu_item_id,
          covered_price_vnd: pv!.covered_price_vnd,
        });
      }
    }

    // Step 2: Process items — validate, price-check, resolve addons (reads only)
    const resolvedItems = await processOrderItems(data.items, prisma, productVoucherMap);

    // Step 2: Calculate base subtotal (before any voucher)
    const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);

    // ── Voucher validation (read-only) ─────────────────────────────────────────
    // Application order: PRODUCT (per-item, already in resolvedItems) → ADDON → DISCOUNT

    // Step 3a: Validate ADDON voucher
    let addon_voucher_id: string | null = null;
    let addon_discount_vnd = 0;

    if (data.addon_voucher_id) {
      const addonVoucher = await prisma.voucher.findUnique({
        where: { id: data.addon_voucher_id },
      });

      try {
        assertVoucherUsable(addonVoucher, session.id, "ADDON");
      } catch (e) {
        if (e instanceof VoucherError) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404, VOUCHER_REDEEMED: 422, VOUCHER_EXPIRED: 422, CONFLICT: 422,
            VALIDATION_ERROR: 400,
          };
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: statusMap[e.code] ?? 400 }
          );
        }
        throw e;
      }

      if (addonVoucher!.addon_option_id) {
        addon_discount_vnd = findAddonVoucherDiscount(resolvedItems, addonVoucher!.addon_option_id);
      }
      addon_voucher_id = addonVoucher!.id;
    }

    // Subtotal after ADDON discount (applied before DISCOUNT voucher)
    const subtotal_after_addon = Math.max(0, subtotal_vnd - addon_discount_vnd);

    // Step 3b: Validate DISCOUNT voucher (applied last)
    let discount_voucher_id: string | null = null;
    let discount_vnd = 0;

    if (data.voucher_id) {
      const discountVoucher = await prisma.voucher.findUnique({ where: { id: data.voucher_id } });

      try {
        assertVoucherUsable(discountVoucher, session.id, "DISCOUNT");
      } catch (e) {
        if (e instanceof VoucherError) {
          const statusMap: Record<string, number> = {
            NOT_FOUND: 404, VOUCHER_REDEEMED: 422, VOUCHER_EXPIRED: 422, CONFLICT: 422,
            VALIDATION_ERROR: 400,
          };
          return NextResponse.json(
            { error: e.message, code: e.code },
            { status: statusMap[e.code] ?? 400 }
          );
        }
        throw e;
      }

      discount_vnd = calcDiscountVoucher(discountVoucher!, subtotal_after_addon);
      discount_voucher_id = discountVoucher!.id;
    }

    const total_vnd = Math.max(0, subtotal_after_addon - discount_vnd);

    // Step 3c: Compute PRODUCT voucher surplus points (per item)
    // Surplus = floor((covered_price_vnd - actual_total) / 10000), min 0.
    // actual_total = original drink price + addons price (BEFORE voucher discount).
    const productVoucherSurplusMap: Map<string, number> = new Map();
    for (const item of resolvedItems) {
      if (item.product_voucher_id) {
        const pvInfo = productVoucherMap.get(item.product_voucher_id);
        if (pvInfo) {
          const actual_total = item.original_unit_price_vnd + item.addons_price_vnd;
          const surplus = calcProductVoucherSurplusPoints(pvInfo.covered_price_vnd, actual_total);
          if (surplus > 0) {
            productVoucherSurplusMap.set(item.product_voucher_id, surplus);
          }
        }
      }
    }

    // Step 4: Generate unique order code (read — collision check)
    const order_code = await generateOrderCode(prisma);

    // Step 5: Compute auto-cancel deadline
    const auto_cancel_at = new Date(Date.now() + AUTO_CANCEL_MINUTES * 60 * 1000);

    // ── Phase 2: WRITES only (short transaction — pgBouncer compatible) ──────
    const order = await prisma.$transaction(
      async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            user_id: session.id,
            voucher_id: discount_voucher_id,
            addon_voucher_id: addon_voucher_id,
            status: "PENDING",
            order_type: data.order_type,
            order_code,
            subtotal_vnd,
            discount_vnd: addon_discount_vnd + discount_vnd,
            total_vnd,
            points_earned: null,
            pickup_time: data.order_type === "PICKUP" 
              ? (data.pickup_time ? new Date(data.pickup_time) : new Date(Date.now() + 10 * 60 * 1000))
              : (data.pickup_time ? new Date(data.pickup_time) : null),
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

        // Reserve DISCOUNT voucher — becomes REDEEMED after admin confirms payment
        if (discount_voucher_id) {
          await tx.voucher.update({
            where: { id: discount_voucher_id },
            data: { status: "RESERVED" },
          });
        }

        // Reserve ADDON voucher — same PENDING→RESERVED flow
        if (addon_voucher_id) {
          await tx.voucher.update({
            where: { id: addon_voucher_id },
            data: { status: "RESERVED" },
          });
        }

        // Reserve ALL PRODUCT vouchers — prevents double-use across concurrent orders
        for (const pvId of productVoucherMap.keys()) {
          await tx.voucher.update({
            where: { id: pvId },
            data: { status: "RESERVED" },
          });
        }

        // Award PRODUCT voucher surplus points immediately
        for (const [pvId, surplusPoints] of productVoucherSurplusMap) {
          await tx.user.update({
            where: { id: session.id },
            data: { points_balance: { increment: surplusPoints } },
          });
          await tx.pointsLog.create({
            data: {
              user_id: session.id,
              delta: surplusPoints,
              reason: "voucher_surplus",
              voucher_id: pvId,
              performed_by: null,
              order_id: createdOrder.id,
            },
          });
        }

        return createdOrder;
      },
      { maxWait: 5000, timeout: 10000 }
    );

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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;

  try {
    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where: { user_id: session.id } }),
      prisma.order.findMany({
        where: { user_id: session.id },
        skip,
        take: limit,
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
    })]);

    const totalPages = Math.ceil(total / limit);

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

    return NextResponse.json({ 
      data,
      meta: { total, page, totalPages }
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
