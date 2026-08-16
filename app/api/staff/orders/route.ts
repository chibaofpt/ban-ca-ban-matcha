import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSession, normalizePhone } from "@/lib/auth";
import { staffOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { ProductVoucherInfo } from "@/lib/orders";
import {
  assertVoucherUsable,
  VoucherError,
} from "@/lib/vouchers";
import { calcOrderTotals } from "@/lib/orderCalculator";
import type { CalcDiscountVoucher } from "@/lib/orderCalculator";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { BundlePromotionError } from "@/lib/promotionBundle";
import { resolveOrderBundle, type OrderBundleDatabase } from "@/lib/orderBundle";
import { persistOrderBundle } from "@/lib/orderBundleWrite";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

import { logSystemEvent } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  resolveCustomerIdentifier,
  resolveOwnedVoucherIdentifier,
} from "@/lib/publicIdentifiers";
import { toPublicOrderDto } from "@/lib/orderPublicDto";
import { getOrderValueViolation } from "@/lib/orderLimits";
import {
  claimCounterVoucher,
  getPendingPaymentQrUrl,
  getPendingPaymentWhere,
  prepareCounterPayment,
  StaffPaymentBusinessError,
  toStaffOrderPaymentResult,
} from "@/lib/staffOrderPayment";

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

  const accountRateLimit = await checkRateLimit("staffOrderAccount", session.id);
  if (!accountRateLimit.allowed) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu, vui lòng thử lại sau.", code: "TOO_MANY_REQUESTS" },
      {
        status: 429,
        headers: { "Retry-After": String(accountRateLimit.retryAfterSeconds) },
      },
    );
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
    if (isAnonymous && data.items.some((item) => item.addon_voucher_ids.length > 0)) {
      return NextResponse.json(
        { error: "Addon voucher cannot be applied to anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (isAnonymous && data.items.some((i) => i.product_voucher_id || i.item_voucher_id)) {
      return NextResponse.json(
        { error: "Product voucher cannot be used for anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }
    if (isAnonymous && data.bundle_voucher_qr_token) {
      return NextResponse.json(
        { error: "Bundle voucher cannot be used for anonymous orders", code: "VALIDATION_ERROR" },
        { status: 400 },
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

    // Step 2: Validate all PRODUCT vouchers BEFORE processOrderItems.
    const existingUserForVoucher: { id: string } | null = existingUser;

    // ── QR token verification — required for STAFF when order has any voucher ──
    const hasAnyVoucher = (
      data.discount_voucher_ids.length > 0 ||
      Boolean(data.bundle_voucher_qr_token) ||
      data.items.some((i) => i.product_voucher_id || i.item_voucher_id || (i.addon_voucher_ids && i.addon_voucher_ids.length > 0))
    );

    if (hasAnyVoucher && !existingUser) {
      return NextResponse.json(
        { error: "Voucher requires an existing customer account", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (existingUser) {
      await ensureAutoGrantedVouchers(
        prisma as unknown as VoucherIssuanceDatabase,
        existingUser.id,
      );
      // Expire every active voucher before validating any voucher type.
      await lazyExpireVouchers(existingUser.id);
    }
    const voucherQrTokens = new Map<string, string>();

    if (hasAnyVoucher && existingUser) {
      if (session.role === "STAFF") {
        if (!data.customer_qr_token) {
          return NextResponse.json(
            { error: "customer_qr_token bắt buộc khi có voucher", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        const qrUser = await resolveCustomerIdentifier(data.customer_qr_token);
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
        if (item.item_voucher_id && item.product_voucher_id) {
          return NextResponse.json(
            { error: "Chỉ được gửi một loại voucher cho mỗi món", code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
        const submittedItemVoucherId = item.item_voucher_id ?? item.product_voucher_id;
        if (submittedItemVoucherId) {
          const pv = await resolveOwnedVoucherIdentifier(
            submittedItemVoucherId,
            existingUserForVoucher.id,
          );
          if (pv && productVoucherMap.has(pv.id)) {
            return NextResponse.json(
              { error: "The same product voucher cannot be applied to multiple items", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          try {
            const expectedType = item.item_voucher_id ? "ITEM" : "PRODUCT";
            assertVoucherUsable(pv, existingUserForVoucher.id, expectedType);
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
          if (!pv!.menu_item_id || (pv!.voucher_type === "PRODUCT" && !pv!.covered_price_vnd)) {
            return NextResponse.json(
              { error: "ITEM voucher is not properly configured", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
          productVoucherMap.set(pv!.id, {
            menu_item_id: pv!.menu_item_id,
            covered_price_vnd: pv!.covered_price_vnd ?? 0,
            voucher_type: pv!.voucher_type === "ITEM" ? "ITEM" : "PRODUCT",
          });
          if (item.item_voucher_id) item.item_voucher_id = pv!.id;
          else item.product_voucher_id = pv!.id;
          voucherQrTokens.set(pv!.id, pv!.qr_token);
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
            const dbAv = await resolveOwnedVoucherIdentifier(av.voucher_id, existingUser.id);
            if (dbAv && addonVoucherIds.has(dbAv.id)) {
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

            const matchingAddonInput = item.addon_option_ids.find(
              (addon) => addon.option_id === av.addon_option_id
            );
            if (!matchingAddonInput) {
              return NextResponse.json(
                { error: "Voucher áp dụng cho addon không có trong món nước", code: "VALIDATION_ERROR" },
                { status: 400 }
              );
            }

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
            av.voucher_id = dbAv!.id;
            voucherQrTokens.set(dbAv!.id, dbAv!.qr_token);
          }
        }
      }
    }

    // Step 3: Validate + price-check all items (reads from DB, no writes)
    const resolvedItems = await processOrderItems(data.items, prisma, productVoucherMap, addonVoucherMap);
    const bundle = data.bundle_voucher_qr_token && existingUser
      ? await resolveOrderBundle(prisma as unknown as OrderBundleDatabase, {
          qr_token: data.bundle_voucher_qr_token,
          voucher_owner_id: existingUser.id,
          items: data.items,
          resolved_items: resolvedItems,
          reward_allocations: data.bundle_reward_allocations,
        })
      : null;

    const calculatorItems = resolvedItems.map((item, index) => ({
      menu_item_id: item.menu_item_id,
      unit_price_vnd: item.unit_price_vnd,
      addons_price_vnd: item.addons_price_vnd,
      quantity: item.quantity,
      line_total: item.line_total,
      bundle_discount_vnd: bundle?.line_discounts_vnd[index] ?? 0,
      product_voucher_id: item.product_voucher_id,
      item_voucher_id: item.item_voucher_id,
      product_voucher_covered_vnd: (item.item_voucher_id ?? item.product_voucher_id)
        ? (productVoucherMap.get(item.item_voucher_id ?? item.product_voucher_id ?? "")?.covered_price_vnd ?? 0)
        : 0,
      addon_vouchers: item.addon_voucher_ids.map((voucher) => {
        const addon = item.resolvedAddons.find(
          (resolvedAddon) => resolvedAddon.addon_option_id === voucher.addon_option_id
        );
        return {
          voucher_id: voucher.voucher_id,
          addon_option_id: voucher.addon_option_id,
          covered_price_vnd: addon?.unit_price_vnd ?? 0,
          unit_price_vnd: addon?.unit_price_vnd ?? 0,
          gram_value: addon?.gram_value ?? null,
        };
      }),
    }));
    const baseCalculation = calcOrderTotals({
      items: calculatorItems,
      discountVouchers: [],
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });

    // ── Validate DISCOUNT vouchers (multi) ──────────────────────────────
    const validatedDiscountVouchers: CalcDiscountVoucher[] = [];
    let percentVoucherCount = 0;

    const discountable_subtotal_vnd = baseCalculation.discountable_subtotal_vnd;

    if (existingUser && data.discount_voucher_ids.length > 0) {
      const uniqueDiscountIds = Array.from(new Set(data.discount_voucher_ids));
      for (const dvId of uniqueDiscountIds) {
        const dv = await resolveOwnedVoucherIdentifier(dvId, existingUser.id);
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
        // Check min_order against discountable_subtotal (after PRODUCT/ADDON)
        if (dv!.min_order_vnd !== null && discountable_subtotal_vnd < dv!.min_order_vnd) {
          return NextResponse.json(
            {
              error: `Đơn hàng tối thiểu ${(dv!.min_order_vnd / 1000).toLocaleString("vi-VN")}k để sử dụng voucher giảm giá này`,
              code: "MIN_ORDER_NOT_MET"
            },
            { status: 400 }
          );
        }
        validatedDiscountVouchers.push({
          id: dv!.id,
          discount_type: dv!.discount_type as "FIXED" | "PERCENT",
          discount_value: dv!.discount_value ?? 0,
          min_order_vnd: dv!.min_order_vnd,
        });
        voucherQrTokens.set(dv!.id, dv!.qr_token);
      }
    }

    const calculation = calcOrderTotals({
      items: calculatorItems,
      discountVouchers: validatedDiscountVouchers,
      freeshipVoucher: null,
      shipping_fee_vnd: 0,
    });
    const { subtotal_vnd, total_voucher_discount_vnd, total_vnd } = calculation;
    const orderValueViolation = getOrderValueViolation(calculation.grand_total_vnd);
    if (orderValueViolation) {
      return NextResponse.json(orderValueViolation, { status: 422 });
    }
    const appliedVoucherIds = new Set(calculation.appliedVoucherIds);
    const appliedDiscountVouchers = validatedDiscountVouchers.filter((voucher) =>
      appliedVoucherIds.has(voucher.id)
    );
    const appliedAddonVoucherIds = Array.from(addonVoucherIds).filter((voucherId) =>
      appliedVoucherIds.has(voucherId)
    );
    const appliedProductVoucherIds = Array.from(productVoucherMap.keys()).filter((voucherId) =>
      appliedVoucherIds.has(voucherId)
    );
    // Anonymous orders never earn points
    const points_earned = isAnonymous ? 0 : Math.floor(total_vnd / 10000);
    const payment = await prepareCounterPayment(data.payment_method, calculation.grand_total_vnd);

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
            status: payment.status,
            payment_method: payment.paymentMethod,
            order_code: payment.orderCode,
            auto_cancel_at: payment.autoCancelAt,
            subtotal_vnd,
            total_voucher_discount_vnd,
            total_vnd,
            shipping_fee_vnd: 0,
            freeship_discount_vnd: 0,
            grand_total_vnd: total_vnd,
            points_earned: payment.pointsAreDeferred ? null : points_earned,
            pickup_time: null,
            note: null,
            items: {
              create: resolvedItems.map((item, index) => {
                const itemCalculation = calculation.itemResults[index];
                if (!itemCalculation) {
                  throw new OrderValidationError("VALIDATION_ERROR", "Missing item voucher calculation.");
                }
                return {
                  menu_item_id: item.menu_item_id,
                  quantity: item.quantity,
                  size: item.size,
                  unit_price_vnd: item.unit_price_vnd,
                  addons_price_vnd: item.addons_price_vnd,
                  product_voucher_discount_vnd: itemCalculation.product_voucher_discount_vnd + itemCalculation.item_voucher_discount_vnd,
                  total_discount_vnd: itemCalculation.total_discount_vnd,
                  sweetness: item.sweetness as SweetnessLevel,
                  ice_option: item.ice_option as IceOption,
                  coldwhisk: item.coldwhisk,
                  note: item.note,
                  product_voucher_id: itemCalculation.product_voucher_id,
                  item_voucher_id: itemCalculation.item_voucher_id,
                  addonVouchers: { create: itemCalculation.addon_vouchers },
                  selected_powder_id: item.selected_powder_id,
                  selected_milk_type_id: item.selected_milk_type_id,
                  base_liquid_ml: item.base_liquid_ml,
                  addons: {
                    create: item.resolvedAddons.map((addon) => ({
                      addon_option_id: addon.addon_option_id,
                      quantity: addon.quantity,
                      unit_price_vnd: addon.unit_price_vnd,
                    })),
                  },
                };
              }),
            },
          },
          include: { items: { include: { addons: true } } },
        });

        // Claim only vouchers actually applied by the shared calculator.
        for (const dv of appliedDiscountVouchers) {
          await claimCounterVoucher(
            tx,
            dv.id,
            payment.paymentMethod,
            session.id,
            "Voucher discount đã được sử dụng hoặc đang bị khóa.",
          );
          await tx.orderDiscountVoucher.create({
            data: { order_id: createdOrder.id, voucher_id: dv.id },
          });
        }

        for (const avId of appliedAddonVoucherIds) {
          await claimCounterVoucher(
            tx,
            avId,
            payment.paymentMethod,
            session.id,
            "Voucher addon đã được sử dụng hoặc đang bị khóa.",
          );
        }

        for (const pvId of appliedProductVoucherIds) {
          await claimCounterVoucher(
            tx,
            pvId,
            payment.paymentMethod,
            session.id,
            "Voucher sản phẩm đã được sử dụng hoặc đang bị khóa.",
          );
        }
        if (bundle) {
          await persistOrderBundle(tx, {
            order_id: createdOrder.id,
            order_items: createdOrder.items,
            source_items: data.items,
            bundle,
            redeem_immediately: payment.status === "COMPLETED",
            performed_by: session.id,
          });
        }

        // Award order_complete points only for orders with a known user
        if (!payment.pointsAreDeferred && userId && points_earned > 0) {
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

        // Award PRODUCT voucher surplus points (aggregate)
        if (!payment.pointsAreDeferred && userId) {
          const surplusPoints = Math.floor(calculation.order_surplus_vnd / 10000);
          if (surplusPoints > 0) {
            await tx.user.update({
              where: { id: userId },
              data: { points_balance: { increment: surplusPoints } },
            });
            await tx.pointsLog.create({
              data: {
                user_id: userId,
                delta: surplusPoints,
                reason: "voucher_surplus",
                voucher_id: null, // Aggregate — not per-item
                performed_by: null,
                order_id: createdOrder.id,
              },
            });
          }
        }

        return createdOrder;
      },
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }
    );
    const skipped_vouchers = Array.from(new Set(calculation.skippedVoucherIds)).flatMap(
      (voucherId) => {
        const qrToken = voucherQrTokens.get(voucherId);
        return qrToken ? [qrToken] : [];
      }
    );

    return NextResponse.json(
      {
        data: toStaffOrderPaymentResult(order, payment, skipped_vouchers),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof BundlePromotionError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "BUNDLE_NOT_ELIGIBLE",
          details: { reason: err.reason },
        },
        { status: err.reason === "BUNDLE_VOUCHER_NOT_FOUND" ? 404 : 422 },
      );
    }
    if (err instanceof StaffPaymentBusinessError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "BUSINESS_RULE_VIOLATION",
          details: { reason: err.reason },
        },
        { status: 422 },
      );
    }

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

    const errName = err instanceof Error ? err.name : typeof err;
    
    // Fallback to console + save to SystemLog
    console.error("[POST /api/staff/orders] UNHANDLED ERROR:", { name: errName });
    await logSystemEvent({
      level: "error",
      source: "POST /api/staff/orders",
      message: "Unhandled staff order creation error",
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
 *   status:     Single status filter such as "PENDING" for payment recovery.
 *               Omit to return all non-PENDING statuses for PICKUP/DELIVERY,
 *               or all statuses for COUNTER.
 *   mine:       "true" limits PENDING counter transfers to the current creator.
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
  const mineOnly = searchParams.get('mine') === 'true';
  
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;

  // Cancelled history remains admin-only. Staff may recover only their own pending transfers.
  if (statusParam === 'CANCELLED' && session.role === 'STAFF') {
    return NextResponse.json(
      { error: 'Forbidden — only ADMIN can view this tab', code: 'FORBIDDEN' },
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
      Object.assign(where, getPendingPaymentWhere(session.role, session.id, mineOnly));
    } else if (statusParam === 'CANCELLED') {
      // "Đã huỷ" tab: show only CANCELLED orders (admin only — enforced above)
      where.status = 'CANCELLED';
    } else if (orderTypeParam && !orderTypeParam.includes('COUNTER')) {
      // "Khách đặt" tab: show PICKUP/DELIVERY orders that have passed PENDING, exclude CANCELLED
      where.status = { in: ['ADMIN_CONFIRMED', 'STAFF_DONE', 'COMPLETED'] };
    } else if (orderTypeParam) {
      // "Tại quầy" tab (COUNTER): show all except CANCELLED
      where.status = { notIn: ['CANCELLED'] };
    }


    // Filter for STAFF: only see their own orders or unassigned ADMIN_CONFIRMED customer orders
    if (session.role === 'STAFF' && statusParam !== 'PENDING') {
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
          discountVouchers: {
            include: {
              voucher: {
                include: { package: { select: { name: true } } }
              }
            }
          },
          user: { select: { name: true, phone_number: true } },
          items: {
            include: {
              productVoucher: {
                include: { package: { select: { name: true } } }
              },
              itemVoucher: {
                include: { package: { select: { name: true } } }
              },
              addonVouchers: {
                include: {
                  voucher: {
                    include: { package: { select: { name: true } } }
                  }
                }
              },
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
            const wasCancelled = await prisma.$transaction(
              async (tx) => {
                const claim = await tx.order.updateMany({
                  where: { id: orderId, status: 'PENDING' },
                  data: { status: 'CANCELLED' },
                });
                if (claim.count !== 1) return false;
                await restoreVouchersOnCancel(tx, orderId);
                return true;
              },
              { maxWait: 5000, timeout: 10000 }
            );
            // Update in-memory for response
            if (wasCancelled) {
              expired.status = 'CANCELLED';
            }
          })
        );
      }
    }

    const data = orders.map((order) => ({
      ...toPublicOrderDto(order),
      payment_qr_url: getPendingPaymentQrUrl(order),
    }));

    return NextResponse.json({ 
      data,
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
