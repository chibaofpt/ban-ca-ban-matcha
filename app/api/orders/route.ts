import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { customerOrderSchema } from "@/lib/validations/order";
import { processOrderItems, OrderValidationError, PriceChangedError } from "@/lib/orders";
import type { ProductVoucherInfo } from "@/lib/orders";
import {
  assertVoucherUsable,
  calcMultiDiscountVouchers,
  calcProductVoucherSurplusPoints,
  VoucherError,
} from "@/lib/vouchers";
import { generateOrderCode } from "@/lib/orderCode";
import { buildVietQRUrl } from "@/lib/vietqr";
import { checkStoreOpen, validatePickupTime } from "@/lib/storeSchedule";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import { logSystemEvent } from "@/lib/logger";
import { calcShippingFee, calcFreeshipDiscount } from "@/src/utils/pricing";
import { goongDistanceMatrix, getStoreLocation } from "@/lib/goong";
import { DELIVERY_CONFIG } from "@/src/constants/delivery";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { after } from "next/server";
import { sendPushToRoles } from "@/lib/push";

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

    // 5.2. Delivery validation
    let shipping_fee_vnd = 0;
    let freeship_discount_vnd = 0;
    let actual_distance_km = 0;

    if (data.order_type === "DELIVERY") {
      if (!data.delivery_lat || !data.delivery_lng || !data.delivery_receiver_name || !data.delivery_receiver_phone) {
        return NextResponse.json(
          { error: "Vui lòng cung cấp đầy đủ thông tin giao hàng", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      if (data.address_id) {
        const address = await prisma.address.findUnique({
          where: { id: data.address_id }
        });
        if (address && address.distance_km !== null) {
          actual_distance_km = address.distance_km;
        }
      }

      // Fallback to Goong if no address_id or distance_km is null
      if (actual_distance_km === 0) {
        const store = getStoreLocation();
        const distanceMatrix = await goongDistanceMatrix(store.lat, store.lng, data.delivery_lat, data.delivery_lng);
        
        if (!distanceMatrix) {
          return NextResponse.json(
            { error: "Không thể tính toán khoảng cách giao hàng. Vui lòng thử lại.", code: "DISTANCE_MATRIX_FAILED" },
            { status: 400 }
          );
        }
        actual_distance_km = distanceMatrix.distanceKm;
      }

      if (actual_distance_km > DELIVERY_CONFIG.MAX_RADIUS_KM) {
        return NextResponse.json(
          { 
            error: `Khoảng cách giao hàng (${actual_distance_km.toFixed(1)}km) vượt quá giới hạn cho phép (${DELIVERY_CONFIG.MAX_RADIUS_KM}km)`, 
            code: "DELIVERY_OUT_OF_RANGE",
            details: { distanceKm: actual_distance_km }
          },
          { status: 400 }
        );
      }

      shipping_fee_vnd = calcShippingFee(actual_distance_km);

      if (data.client_shipping_fee_vnd !== undefined && data.client_shipping_fee_vnd !== shipping_fee_vnd) {
        return NextResponse.json(
          {
            error: "Phí giao hàng đã thay đổi. Vui lòng thử lại.",
            code: "SHIPPING_FEE_CHANGED",
            details: { conflicts: ["shipping_fee"] },
          },
          { status: 409 }
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

    // Step 2: Validate per-item ADDON vouchers
    const addonVoucherMap = new Map<string, string>(); // voucherId → addon_option_id
    const addonVoucherIds = new Set<string>();
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

          const matchingAddonInput = item.addon_option_ids?.find((a: any) => a.option_id === av.addon_option_id);
          if (!matchingAddonInput) {
            return NextResponse.json(
              { error: "Voucher áp dụng cho addon không có trong món nước", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }

          const dbAv = await prisma.voucher.findUnique({ where: { id: av.voucher_id } });
          try {
            assertVoucherUsable(dbAv, session.id, "ADDON");
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

    // Step 3: Process items — validate, price-check, resolve addons (reads only)
    const resolvedItems = await processOrderItems(data.items, prisma, productVoucherMap, addonVoucherMap);
    const subtotal_vnd = resolvedItems.reduce((sum, item) => sum + item.line_total, 0);

    // Step 4: Validate DISCOUNT vouchers (multi)
    const validatedDiscountVouchers: { id: string; discount_type: import("@prisma/client").DiscountType | null; discount_value: number | null }[] = [];
    let percentVoucherCount = 0;
    
    let final_freeship_voucher_id = data.freeship_voucher_id;
    const uniqueDiscountIds = Array.from(new Set(data.discount_voucher_ids));

    for (const dvId of uniqueDiscountIds) {
      const dv = await prisma.voucher.findUnique({ where: { id: dvId } });
      
      if (dv?.voucher_type === "FREESHIP") {
        if (final_freeship_voucher_id && final_freeship_voucher_id !== dvId) {
          return NextResponse.json(
            { error: "Chỉ được áp dụng tối đa 1 voucher FREESHIP", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        final_freeship_voucher_id = dvId;
        continue;
      }

      try {
        assertVoucherUsable(dv, session.id, "DISCOUNT");
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
      if (dv!.min_order_vnd !== null && subtotal_vnd < dv!.min_order_vnd) {
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
        discount_type: dv!.discount_type,
        discount_value: dv!.discount_value,
      });
    }

    const discount_vnd = calcMultiDiscountVouchers(validatedDiscountVouchers, subtotal_vnd);
    const total_vnd = Math.max(0, subtotal_vnd - discount_vnd);

    // Step 4b: Validate FREESHIP voucher (Delivery only)
    if (final_freeship_voucher_id) {
      if (data.order_type !== "DELIVERY") {
        return NextResponse.json(
          { error: "Voucher FREESHIP chỉ áp dụng cho đơn giao hàng", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      const fv = await prisma.voucher.findUnique({ where: { id: final_freeship_voucher_id } });
      try {
        assertVoucherUsable(fv, session.id, "FREESHIP");
      } catch (e) {
        if (e instanceof VoucherError) {
          const status = e.code === "NOT_FOUND" ? 404 : e.code === "VALIDATION_ERROR" ? 400 : 422;
          return NextResponse.json({ error: e.message, code: e.code }, { status });
        }
        throw e;
      }

      if (!fv!.covered_delivery_fee_vnd) {
        return NextResponse.json(
          { error: "Voucher FREESHIP không hợp lệ (thiếu số tiền hỗ trợ)", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      // Check minimum order requirement (compare with total_vnd = subtotal after discount, before shipping)
      if (fv!.min_order_vnd !== null && total_vnd < fv!.min_order_vnd) {
        return NextResponse.json(
          { 
            error: `Đơn hàng tối thiểu ${(fv!.min_order_vnd / 1000).toLocaleString("vi-VN")}k để sử dụng voucher freeship này`, 
            code: "MIN_ORDER_NOT_MET" 
          },
          { status: 400 }
        );
      }

      freeship_discount_vnd = calcFreeshipDiscount(shipping_fee_vnd, fv!.covered_delivery_fee_vnd);
    }

    const grand_total_vnd = Math.max(0, total_vnd + shipping_fee_vnd - freeship_discount_vnd);

    // Step 3c: Compute PRODUCT voucher surplus points (per item)
    // Surplus = floor((covered_price_vnd - actual_total) / 10000), min 0.
    // actual_total = original drink price + addons price (BEFORE voucher discount).
    const productVoucherSurplusMap: Map<string, number> = new Map();
    for (const item of resolvedItems) {
      if (item.product_voucher_id) {
        const pvInfo = productVoucherMap.get(item.product_voucher_id);
        if (pvInfo) {
          const actual_total = item.original_unit_price_vnd + item.original_addons_price_vnd - item.addon_discount_vnd;
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
            status: "PENDING",
            order_type: data.order_type,
            order_code,
            subtotal_vnd,
            discount_vnd,
            total_vnd,
            shipping_fee_vnd,
            freeship_discount_vnd,
            grand_total_vnd,
            freeship_voucher_id: final_freeship_voucher_id ?? null,
            points_earned: null,
            pickup_time: data.order_type === "PICKUP" 
              ? (data.pickup_time ? new Date(data.pickup_time) : new Date(Date.now() + 10 * 60 * 1000))
              : (data.pickup_time ? new Date(data.pickup_time) : null),
            note: data.note ?? null,
            auto_cancel_at,
            address_id: data.address_id ?? null,
            delivery_address: data.delivery_address ?? null,
            delivery_lat: data.delivery_lat ?? null,
            delivery_lng: data.delivery_lng ?? null,
            delivery_distance_km: data.order_type === "DELIVERY" ? actual_distance_km : null,
            delivery_receiver_name: data.delivery_receiver_name ?? null,
            delivery_receiver_phone: data.delivery_receiver_phone ?? null,
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
                surplus_points: productVoucherSurplusMap.get(item.product_voucher_id ?? "") || null,
                addonVouchers: {
                  create: item.addon_voucher_ids.map(v => ({
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

        // Reserve DISCOUNT vouchers + link to order
        for (const dv of validatedDiscountVouchers) {
          const updated = await tx.voucher.updateMany({
            where: { id: dv.id, status: "ACTIVE" },
            data: { status: "RESERVED" },
          });
          if (updated.count === 0) {
            throw new OrderValidationError("CONFLICT", "Voucher discount đã được sử dụng hoặc đang bị khóa.");
          }
          await tx.orderDiscountVoucher.create({
            data: { order_id: createdOrder.id, voucher_id: dv.id },
          });
        }

        // Reserve FREESHIP voucher
        if (final_freeship_voucher_id) {
          const updated = await tx.voucher.updateMany({
            where: { id: final_freeship_voucher_id, status: "ACTIVE" },
            data: { status: "RESERVED" },
          });
          if (updated.count === 0) {
            throw new OrderValidationError("CONFLICT", "Voucher freeship đã được sử dụng hoặc đang bị khóa.");
          }
        }

        // Reserve ADDON vouchers (per-item)
        for (const avId of addonVoucherIds) {
          const updated = await tx.voucher.updateMany({
            where: { id: avId, status: "ACTIVE" },
            data: { status: "RESERVED" },
          });
          if (updated.count === 0) {
            throw new OrderValidationError("CONFLICT", "Voucher addon đã được sử dụng hoặc đang bị khóa.");
          }
        }

        // Reserve ALL PRODUCT vouchers — prevents double-use across concurrent orders
        for (const pvId of productVoucherMap.keys()) {
          const updated = await tx.voucher.updateMany({
            where: { id: pvId, status: "ACTIVE" },
            data: { status: "RESERVED" },
          });
          if (updated.count === 0) {
            throw new OrderValidationError("CONFLICT", "Voucher sản phẩm đã được sử dụng hoặc đang bị khóa.");
          }
        }

        // Award PRODUCT voucher surplus points IMMEDIATELY is REMOVED.
        // Surplus points are now saved to OrderItem and awarded upon payment confirmation (ADMIN_CONFIRMED).

        return createdOrder;
      },
      { maxWait: 5000, timeout: 10000 }
    );

    const payment_qr_url = buildVietQRUrl({ amount: grand_total_vnd, orderCode: order_code });

    // Sau khi response HTTP đã trả về Vercel xong, chạy background job push notification:
    after(() => {
      console.log(`[AFTER JOB] Starting background push notification for new order: ${order.order_code}`);
      sendPushToRoles(["ADMIN"], {
        title: "🔔 Đơn hàng mới (Online)",
        body: `${order.order_code} — ${data.items.length} món — ${new Intl.NumberFormat("vi-VN").format(order.total_vnd)}đ`,
        url: "/admin/orders",
      })
        .then(() => console.log(`[AFTER JOB] Successfully completed push task for order: ${order.order_code}`))
        .catch((err) => console.error("[AFTER JOB] Failed to send push:", err));
    });

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
          shipping_fee_vnd: order.shipping_fee_vnd,
          freeship_discount_vnd: order.freeship_discount_vnd,
          grand_total_vnd: order.grand_total_vnd,
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
    
    await logSystemEvent({
      level: "error",
      source: "POST /api/orders",
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
        discountVouchers: {
          include: {
            voucher: {
              include: { package: { select: { name: true } } }
            }
          }
        },
        items: {
          include: {
            productVoucher: {
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
    })]);

    const totalPages = Math.ceil(total / limit);

    // Lazy auto-cancel: expire any PENDING orders past their deadline.
    // Triggered on every customer list fetch — cron is daily safety net only.
    const now = new Date();
    const expiredOrders = orders.filter(
      (o) => o.status === "PENDING" && o.auto_cancel_at && o.auto_cancel_at <= now
    );
    if (expiredOrders.length > 0) {
      await Promise.all(
        expiredOrders.map(async (order) => {
          try {
            await prisma.$transaction(
              async (tx) => {
                const check = await tx.order.findUnique({
                  where: { id: order.id },
                  select: { status: true },
                });
                if (check?.status !== "PENDING") return; // race-safe: already handled
                await tx.order.update({
                  where: { id: order.id },
                  data: { status: "CANCELLED" },
                });
                await restoreVouchersOnCancel(tx, order.id);
              },
              { maxWait: 5000, timeout: 10000 }
            );
            order.status = "CANCELLED"; // update in-memory for response
          } catch (err) {
            console.error(`[GET /api/orders lazy-cancel] Failed for order ${order.id}:`, err);
          }
        })
      );
    }

    // Build payment_qr_url for each PENDING order
    const data = orders.map((order) => {
      let payment_qr_url: string | null = null;
      if (order.status === "PENDING" && order.order_code && order.order_type !== "COUNTER") {
        try {
          payment_qr_url = buildVietQRUrl({ amount: order.grand_total_vnd || order.total_vnd, orderCode: order.order_code });
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
