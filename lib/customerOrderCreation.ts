import { after, NextResponse } from "next/server";
import { calculateCustomerOrderDiscounts } from "@/lib/customerOrderDiscounts";
import { resolveCustomerFulfillment } from "@/lib/customerOrderDelivery";
import { resolveCustomerItemVouchers } from "@/lib/customerOrderItemVouchers";
import { writeCustomerOrder } from "@/lib/customerOrderWrite";
import { lazyExpireVouchers } from "@/lib/lazyExpireVouchers";
import { generateOrderCode } from "@/lib/orderCode";
import { getOrderValueViolation } from "@/lib/orderLimits";
import { processOrderItems } from "@/lib/orders";
import { resolveOrderBundles, type OrderBundleDatabase } from "@/lib/orderBundle";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/serializableTransaction";
import { sendPushToRoles } from "@/lib/push";
import type { CustomerOrderInput } from "@/lib/validations/order";
import { buildVietQRUrl } from "@/lib/vietqr";
import {
  ensureAutoGrantedVouchers,
  type VoucherIssuanceDatabase,
} from "@/lib/voucherIssuance";

const AUTO_CANCEL_MINUTES = 20;

/** Executes the validated customer-order workflow and returns its unchanged API response. */
export async function createCustomerOrder(
  data: CustomerOrderInput,
  userId: string,
  acceptanceDate = new Date(),
): Promise<NextResponse> {
  const fulfillment = await resolveCustomerFulfillment(data, userId);
  if (!fulfillment.ok) return fulfillment.response;

  await ensureAutoGrantedVouchers(prisma as unknown as VoucherIssuanceDatabase, userId);
  const originalData = data;
  const response = await runSerializableTransaction(prisma, async (tx) => {
  const data = structuredClone(originalData);
  await lazyExpireVouchers(userId, acceptanceDate, tx);
  const itemVoucherResult = await resolveCustomerItemVouchers(data, userId, tx, acceptanceDate);
  if (!itemVoucherResult.ok) return itemVoucherResult.response;
  const {
    productVoucherMap,
    addonVoucherMap,
    addonVoucherIds,
    voucherQrTokens,
  } = itemVoucherResult.context;

  const resolvedItems = await processOrderItems(
    data.items,
    tx,
    productVoucherMap,
    addonVoucherMap,
  );
  const bundles = data.bundle_applications.length > 0
    ? await resolveOrderBundles(tx as unknown as OrderBundleDatabase, {
        voucher_owner_id: userId,
        now: acceptanceDate,
        items: data.items,
        resolved_items: resolvedItems,
        bundle_applications: data.bundle_applications,
      })
    : { bundles: [], line_discounts_vnd: data.items.map(() => 0), skipped_qr_tokens: [] };
  const calculatorItems = resolvedItems.map((item, index) => ({
    menu_item_id: item.menu_item_id,
    unit_price_vnd: item.unit_price_vnd,
    addons_price_vnd: item.addons_price_vnd,
    quantity: item.quantity,
    line_total: item.line_total,
    bundle_discount_vnd: bundles.line_discounts_vnd[index] ?? 0,
    product_voucher_id: item.product_voucher_id,
    item_voucher_id: item.item_voucher_id,
    product_voucher_covered_vnd: (item.item_voucher_id ?? item.product_voucher_id)
      ? (productVoucherMap.get(item.item_voucher_id ?? item.product_voucher_id ?? "")?.covered_price_vnd ?? 0)
      : 0,
    product_voucher_discount_vnd: productVoucherMap.get(item.product_voucher_id ?? "")?.voucher_type === "PRODUCT_DISCOUNT"
      ? item.product_voucher_discount_vnd
      : undefined,
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
    tx,
    acceptanceDate,
  );
  if (!discountResult.ok) return discountResult.response;
  const { calculation, discountVouchers, freeshipVoucherId } = discountResult.context;

  const orderValueViolation = getOrderValueViolation(calculation.grand_total_vnd);
  if (orderValueViolation) {
    return NextResponse.json(orderValueViolation, { status: 422 });
  }

  const appliedIds = new Set(calculation.appliedVoucherIds);
  const orderCode = await generateOrderCode(tx);
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
    appliedBundles: bundles,
  }, tx);

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
  skippedVouchers.push(...bundles.skipped_qr_tokens.filter((token) => !skippedVouchers.includes(token)));

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
  });
  if (response.status === 201) {
    const payload = await response.clone().json() as {
      data: { order_code: string; grand_total_vnd: number };
    };
    after(() => {
      sendPushToRoles(["ADMIN"], {
        title: "🔔 Đơn hàng mới (Online)",
        body: `${payload.data.order_code} — ${data.items.length} món — ${new Intl.NumberFormat("vi-VN").format(payload.data.grand_total_vnd)}đ`,
        url: "/admin/orders",
      }).catch((error: unknown) => {
        console.error("[AFTER JOB] Failed to send push", {
          name: error instanceof Error ? error.name : typeof error,
        });
      });
    });
  }
  return response;
}
