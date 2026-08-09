import { after, NextResponse } from "next/server";
import { calculateCustomerOrderDiscounts } from "@/lib/customerOrderDiscounts";
import { resolveCustomerFulfillment } from "@/lib/customerOrderDelivery";
import { resolveCustomerItemVouchers } from "@/lib/customerOrderItemVouchers";
import { writeCustomerOrder } from "@/lib/customerOrderWrite";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { generateOrderCode } from "@/lib/orderCode";
import { getOrderValueViolation } from "@/lib/orderLimits";
import { processOrderItems } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { sendPushToRoles } from "@/lib/push";
import type { CustomerOrderInput } from "@/lib/validations/order";
import { buildVietQRUrl } from "@/lib/vietqr";

const AUTO_CANCEL_MINUTES = 20;

/** Executes the validated customer-order workflow and returns its unchanged API response. */
export async function createCustomerOrder(
  data: CustomerOrderInput,
  userId: string,
): Promise<NextResponse> {
  const fulfillment = await resolveCustomerFulfillment(data, userId);
  if (!fulfillment.ok) return fulfillment.response;

  await lazyExpireVouchers(userId);
  const itemVoucherResult = await resolveCustomerItemVouchers(data, userId);
  if (!itemVoucherResult.ok) return itemVoucherResult.response;
  const {
    productVoucherMap,
    addonVoucherMap,
    addonVoucherIds,
    voucherQrTokens,
  } = itemVoucherResult.context;

  const resolvedItems = await processOrderItems(
    data.items,
    prisma,
    productVoucherMap,
    addonVoucherMap,
  );
  const calculatorItems = resolvedItems.map((item) => ({
    menu_item_id: item.menu_item_id,
    unit_price_vnd: item.unit_price_vnd,
    addons_price_vnd: item.addons_price_vnd,
    quantity: item.quantity,
    line_total: item.line_total,
    product_voucher_id: item.product_voucher_id,
    product_voucher_covered_vnd: item.product_voucher_id
      ? (productVoucherMap.get(item.product_voucher_id)?.covered_price_vnd ?? 0)
      : 0,
    addon_vouchers: item.addon_voucher_ids.map((voucher) => {
      const addon = item.resolvedAddons.find(
        (resolvedAddon) => resolvedAddon.addon_option_id === voucher.addon_option_id,
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

  const discountResult = await calculateCustomerOrderDiscounts(
    data,
    userId,
    calculatorItems,
    fulfillment.delivery.shipping_fee_vnd,
    voucherQrTokens,
  );
  if (!discountResult.ok) return discountResult.response;
  const { calculation, discountVouchers, freeshipVoucherId } = discountResult.context;

  const orderValueViolation = getOrderValueViolation(calculation.grand_total_vnd);
  if (orderValueViolation) {
    return NextResponse.json(orderValueViolation, { status: 422 });
  }

  const appliedIds = new Set(calculation.appliedVoucherIds);
  const orderCode = await generateOrderCode(prisma);
  const autoCancelAt = new Date(Date.now() + AUTO_CANCEL_MINUTES * 60 * 1000);
  const order = await writeCustomerOrder({
    data,
    userId,
    orderCode,
    autoCancelAt,
    delivery: fulfillment.delivery,
    resolvedItems,
    calculation,
    appliedDiscountVouchers: discountVouchers,
    appliedFreeshipVoucherId: freeshipVoucherId,
    appliedAddonVoucherIds: Array.from(addonVoucherIds).filter((id) => appliedIds.has(id)),
    appliedProductVoucherIds: Array.from(productVoucherMap.keys()).filter((id) =>
      appliedIds.has(id),
    ),
  });

  const paymentQrUrl = buildVietQRUrl({
    amount: calculation.grand_total_vnd,
    orderCode,
  });
  const skippedVouchers = Array.from(new Set(calculation.skippedVoucherIds)).flatMap(
    (voucherId) => {
      const qrToken = voucherQrTokens.get(voucherId);
      return qrToken ? [qrToken] : [];
    },
  );

  after(() => {
    console.log(`[AFTER JOB] Starting background push notification for new order: ${order.order_code}`);
    sendPushToRoles(["ADMIN"], {
      title: "🔔 Đơn hàng mới (Online)",
      body: `${order.order_code} — ${data.items.length} món — ${new Intl.NumberFormat("vi-VN").format(order.grand_total_vnd)}đ`,
      url: "/admin/orders",
    })
      .then(() => console.log(`[AFTER JOB] Successfully completed push task for order: ${order.order_code}`))
      .catch((error: unknown) => {
        console.error("[AFTER JOB] Failed to send push", {
          name: error instanceof Error ? error.name : typeof error,
        });
      });
  });

  return NextResponse.json(
    {
      data: {
        id: order.id,
        order_code: order.order_code,
        status: order.status,
        order_type: order.order_type,
        payment_method: order.payment_method,
        subtotal_vnd: order.subtotal_vnd,
        total_voucher_discount_vnd: order.total_voucher_discount_vnd,
        total_vnd: order.total_vnd,
        shipping_fee_vnd: order.shipping_fee_vnd,
        freeship_discount_vnd: order.freeship_discount_vnd,
        grand_total_vnd: order.grand_total_vnd,
        pickup_time: order.pickup_time,
        auto_cancel_at: order.auto_cancel_at,
        payment_qr_url: paymentQrUrl,
        skipped_vouchers: skippedVouchers,
      },
    },
    { status: 201 },
  );
}
