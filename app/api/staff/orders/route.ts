import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, normalizePhone } from "@/lib/auth";
import { staffOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { ProductVoucherInfo } from "@/lib/orders";
import {
  assertVoucherUsable,
  calcMultiDiscountVouchers,
  calcProductVoucherSurplusPoints,
  VoucherError,
} from "@/lib/vouchers";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import type { Prisma } from "@prisma/client";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { checkStoreOpen } from "@/lib/storeSchedule";
import { logSystemEvent } from "@/lib/logger";

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
    if (isAnonymous && data.discount_voucher_ids.length > 0) {
      return NextResponse.json(
        { error: "Voucher cannot be applied to anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (isAnonymous && data.items.some((i: any) => i.addon_voucher_ids && i.addon_voucher_ids.length > 0)) {
      return NextResponse.json(
        { error: "Addon voucher cannot be applied to anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (isAnonymous && data.items.some((i) => i.product_voucher_id)) {
      return NextResponse.json(
        { error: "Product voucher cannot be used for anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 5a. Store open check — only applies to non-COUNTER order types.
    // COUNTER = staff at the physical counter, always allowed regardless of hours.
    const orderType = (data as { order_type?: string }).order_type;
    if (orderType && orderType !== "COUNTER") {
      const storeStatus = await checkStoreOpen();
      if (!storeStatus.is_open) {
        return NextResponse.json(
          {
            error: storeStatus.closure_note
              ? `Cửa hàng tạm đóng cửa: ${storeStatus.closure_note}`
              : "Cửa hàng hiện đang đóng cửa",
            code: "STORE_CLOSED",
          },
          { status: 503 }
        );
      }
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

    // Step 2: Validate all PRODUCT vouchers BEFORE processOrderItems.
    let existingUserForVoucher: { id: string } | null = existingUser;

    // ── QR token verification — required for STAFF when order has any voucher ──
    const hasAnyVoucher = (
      data.discount_voucher_ids.length > 0 ||
      data.items.some((i) => i.product_voucher_id || (i.addon_voucher_ids && i.addon_voucher_ids.length > 0))
    );

    if (hasAnyVoucher && existingUser) {
      if (session.role === "STAFF") {
        if (!data.customer_qr_token) {
          return NextResponse.json(
            { error: "customer_qr_token bắt buộc khi có voucher", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        const qrUser = await prisma.user.findUnique({
          where: { qr_token: data.customer_qr_token },
          select: { id: true },
        });
        if (!qrUser || qrUser.id !== existingUser.id) {
          return NextResponse.json(
            { error: "QR không khớp với khách hàng", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
      }
      // ADMIN: auto bypass — no QR check needed
    }

    const productVoucherMap = new Map<string, ProductVoucherInfo>();
    if (existingUserForVoucher) {
      for (const item of data.items) {
        if (item.product_voucher_id) {
          if (productVoucherMap.has(item.product_voucher_id)) {
            return NextResponse.json(
              { error: "The same product voucher cannot be applied to multiple items", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          const pv = await prisma.voucher.findUnique({ where: { id: item.product_voucher_id } });
          try {
            assertVoucherUsable(pv, existingUserForVoucher.id, "PRODUCT");
          } catch (e) {
            if (e instanceof VoucherError) {
              const statusMap: Record<string, number> = {
                NOT_FOUND: 404, VOUCHER_REDEEMED: 422, VOUCHER_EXPIRED: 422,
                CONFLICT: 422, VALIDATION_ERROR: 400,
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
    }

    // ── Validate per-item ADDON vouchers ──────────────────────────────────
    // addonVoucherMap: voucherId → addon_option_id
    const addonVoucherMap = new Map<string, string>();
    const addonVoucherIds = new Set<string>();
    
    if (existingUser) {
      for (const item of data.items) {
        if (item.addon_voucher_ids && item.addon_voucher_ids.length > 0) {
          const itemAddonOptionIds = new Set<string>();
          for (const av of item.addon_voucher_ids) {
            if (addonVoucherIds.has(av.voucher_id)) {
              return NextResponse.json(
                { error: "The same addon voucher cannot be applied to multiple items", code: "VALIDATION_ERROR" },
                { status: 400 }
              );
            }
            if (itemAddonOptionIds.has(av.addon_option_id)) {
              return NextResponse.json(
                { error: "Cannot apply multiple vouchers for the same addon on a single item", code: "VALIDATION_ERROR" },
                { status: 400 }
              );
            }
            itemAddonOptionIds.add(av.addon_option_id);

            const dbAv = await prisma.voucher.findUnique({ where: { id: av.voucher_id } });
            try {
              assertVoucherUsable(dbAv, existingUser.id, "ADDON");
            } catch (e) {
              if (e instanceof VoucherError) {
                const status = e.code === "NOT_FOUND" ? 404 : e.code === "VALIDATION_ERROR" ? 400 : 422;
                return NextResponse.json({ error: e.message, code: e.code }, { status });
              }
              throw e;
            }
            if (!dbAv!.addon_option_id || dbAv!.addon_option_id !== av.addon_option_id) {
              return NextResponse.json(
                { error: "Addon voucher option mismatch or missing", code: "VALIDATION_ERROR" },
                { status: 400 }
              );
            }
            addonVoucherMap.set(dbAv!.id, dbAv!.addon_option_id);
            addonVoucherIds.add(dbAv!.id);
          }
        }
      }
    }

    // Step 3: Validate + price-check all items (reads from DB, no writes)
    const resolvedItems = await processOrderItems(data.items, prisma, productVoucherMap, addonVoucherMap);

    // Step 3: Calculate base subtotal
    const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);

    // ── Validate DISCOUNT vouchers (multi) ──────────────────────────────
    const validatedDiscountVouchers: { id: string; discount_type: import("@prisma/client").DiscountType | null; discount_value: number | null }[] = [];
    let percentVoucherCount = 0;

    if (existingUser && data.discount_voucher_ids.length > 0) {
      const uniqueDiscountIds = Array.from(new Set(data.discount_voucher_ids));
      for (const dvId of uniqueDiscountIds) {
        const dv = await prisma.voucher.findUnique({ where: { id: dvId } });
        try {
          assertVoucherUsable(dv, existingUser.id, "DISCOUNT");
        } catch (e) {
          if (e instanceof VoucherError) {
            const status = e.code === "NOT_FOUND" ? 404 : e.code === "VALIDATION_ERROR" ? 400 : 422;
            return NextResponse.json({ error: e.message, code: e.code }, { status });
          }
          throw e;
        }
        if (dv!.discount_type === "PERCENT") {
          percentVoucherCount++;
          if (percentVoucherCount > 1) {
            return NextResponse.json(
              { error: "Chỉ được áp tối đa 1 voucher giảm phần trăm cho một đơn hàng", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
        }
        validatedDiscountVouchers.push({
          id: dv!.id,
          discount_type: dv!.discount_type,
          discount_value: dv!.discount_value,
        });
      }
    }

    const discount_vnd = calcMultiDiscountVouchers(validatedDiscountVouchers, subtotal_vnd);
    const total_vnd = Math.max(0, subtotal_vnd - discount_vnd);
    // Anonymous orders never earn points
    const points_earned = isAnonymous ? 0 : Math.floor(total_vnd / 10000);

    // PRODUCT voucher surplus points (for linked user only)
    const productVoucherSurplusMap: Map<string, number> = new Map();
    if (existingUser) {
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
    }

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
                addonVouchers: {
                  create: item.addon_voucher_ids.map((v: any) => ({
                    voucher_id: v.voucher_id,
                    addon_option_id: v.addon_option_id,
                  })),
                },
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

        // Mark DISCOUNT vouchers as redeemed (OFFLINE for staff counter)
        for (const dv of validatedDiscountVouchers) {
          await tx.voucher.update({
            where: { id: dv.id },
            data: {
              status: "REDEEMED",
              used_channel: "OFFLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
          await tx.orderDiscountVoucher.create({
            data: { order_id: createdOrder.id, voucher_id: dv.id },
          });
        }

        // Mark ADDON vouchers as redeemed (OFFLINE)
        for (const avId of addonVoucherIds) {
          await tx.voucher.update({
            where: { id: avId },
            data: {
              status: "REDEEMED",
              used_channel: "OFFLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // Mark ALL PRODUCT vouchers as REDEEMED immediately (counter = COMPLETED)
        for (const pvId of productVoucherMap.keys()) {
          await tx.voucher.update({
            where: { id: pvId },
            data: {
              status: "REDEEMED",
              used_channel: "OFFLINE",
              redeemed_at: new Date(),
              redeemed_by: session.id,
            },
          });
        }

        // Award order_complete points only for orders with a known user
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

        // Award PRODUCT voucher surplus points immediately
        if (userId) {
          for (const [pvId, surplusPoints] of productVoucherSurplusMap) {
            await tx.user.update({
              where: { id: userId },
              data: { points_balance: { increment: surplusPoints } },
            });
            await tx.pointsLog.create({
              data: {
                user_id: userId,
                delta: surplusPoints,
                reason: "voucher_surplus",
                voucher_id: pvId,
                performed_by: null,
                order_id: createdOrder.id,
              },
            });
          }
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
    
    // Fallback to console + save to SystemLog
    console.error("[POST /api/staff/orders] UNHANDLED ERROR:", { name: errName, message: errMsg, stack: errStack });
    await logSystemEvent({
      level: "error",
      source: "POST /api/staff/orders",
      message: errMsg,
      error: err,
      context: { body },
    });

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
  
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;

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

    // Filter for STAFF: only see their own orders or unassigned ADMIN_CONFIRMED customer orders
    if (session.role === 'STAFF') {
      where.OR = [
        { handled_by: session.id },
        { 
          order_type: { in: ['PICKUP', 'DELIVERY'] },
          status: 'ADMIN_CONFIRMED'
        }
      ];
    }

    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
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
      })
    ]);

    const totalPages = Math.ceil(total / limit);

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
                await restoreVouchersOnCancel(tx, orderId);
              },
              { maxWait: 5000, timeout: 10000 }
            );
            // Update in-memory for response
            expired.status = 'CANCELLED';
          })
        );
      }
    }

    return NextResponse.json({ 
      data: orders, 
      meta: { total, page, totalPages } 
    });
  } catch (err) {
    console.error('[GET /api/staff/orders]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
