import { prisma } from "@/lib/prisma";
import type { CustomerDeliveryResolution } from "@/lib/customerOrderDelivery";
import type {
  CalcDiscountVoucher,
  CalcOrderResult,
} from "@/lib/orderCalculator";
import { OrderValidationError, type ProcessedOrderItem } from "@/lib/orders";
import type { CustomerOrderInput } from "@/lib/validations/order";
import type { IceOption } from "@/src/lib/types/cart";
import type { SweetnessLevel } from "@/src/lib/types/menu";
import type { Prisma } from "@prisma/client";

interface CreateCustomerOrderParams {
  data: CustomerOrderInput;
  userId: string;
  orderCode: string;
  autoCancelAt: Date;
  delivery: CustomerDeliveryResolution;
  resolvedItems: ProcessedOrderItem[];
  calculation: CalcOrderResult;
  appliedDiscountVouchers: CalcDiscountVoucher[];
  appliedFreeshipVoucherId: string | null;
  appliedAddonVoucherIds: string[];
  appliedProductVoucherIds: string[];
}

async function reserveVoucher(
  tx: Prisma.TransactionClient,
  voucherId: string,
  conflictMessage: string,
): Promise<void> {
  const updated = await tx.voucher.updateMany({
    where: { id: voucherId, status: "ACTIVE" },
    data: { status: "RESERVED" },
  });
  if (updated.count === 0) {
    throw new OrderValidationError("CONFLICT", conflictMessage);
  }
}

/** Persists a customer order and atomically reserves every applied voucher. */
export async function writeCustomerOrder(params: CreateCustomerOrderParams) {
  const {
    data,
    userId,
    orderCode,
    autoCancelAt,
    delivery,
    resolvedItems,
    calculation,
    appliedDiscountVouchers,
    appliedFreeshipVoucherId,
    appliedAddonVoucherIds,
    appliedProductVoucherIds,
  } = params;

  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.create({
        data: {
          user_id: userId,
          status: "PENDING",
          order_type: data.order_type,
          order_code: orderCode,
          subtotal_vnd: calculation.subtotal_vnd,
          total_voucher_discount_vnd: calculation.total_voucher_discount_vnd,
          total_vnd: calculation.total_vnd,
          shipping_fee_vnd: calculation.shipping_fee_vnd,
          freeship_discount_vnd: calculation.freeship_discount_vnd,
          grand_total_vnd: calculation.grand_total_vnd,
          freeship_voucher_id: appliedFreeshipVoucherId,
          points_earned: null,
          pickup_time:
            data.order_type === "PICKUP"
              ? data.pickup_time
                ? new Date(data.pickup_time)
                : new Date(Date.now() + 10 * 60 * 1000)
              : data.pickup_time
                ? new Date(data.pickup_time)
                : null,
          note: data.note ?? null,
          auto_cancel_at: autoCancelAt,
          address_id: delivery.address_id,
          delivery_address: delivery.delivery_address,
          delivery_lat: delivery.delivery_lat,
          delivery_lng: delivery.delivery_lng,
          delivery_distance_km:
            data.order_type === "DELIVERY" ? delivery.actual_distance_km : null,
          delivery_receiver_name: delivery.receiver_name,
          delivery_receiver_phone: delivery.receiver_phone,
          items: {
            create: resolvedItems.map((item, index) => {
              const itemCalculation = calculation.itemResults[index];
              if (!itemCalculation) {
                throw new OrderValidationError(
                  "VALIDATION_ERROR",
                  "Missing item voucher calculation.",
                );
              }
              return {
                menu_item_id: item.menu_item_id,
                quantity: item.quantity,
                size: item.size,
                unit_price_vnd: item.unit_price_vnd,
                addons_price_vnd: item.addons_price_vnd,
                product_voucher_discount_vnd:
                  itemCalculation.product_voucher_discount_vnd,
                total_discount_vnd: itemCalculation.total_discount_vnd,
                sweetness: item.sweetness as SweetnessLevel,
                ice_option: item.ice_option as IceOption,
                coldwhisk: item.coldwhisk,
                note: item.note,
                product_voucher_id: itemCalculation.product_voucher_id,
                addonVouchers: { create: itemCalculation.addon_vouchers },
                selected_powder_id: item.selected_powder_id,
                selected_milk_type_id: item.selected_milk_type_id,
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
      });

      for (const voucher of appliedDiscountVouchers) {
        await reserveVoucher(
          tx,
          voucher.id,
          "Voucher discount đã được sử dụng hoặc đang bị khóa.",
        );
        await tx.orderDiscountVoucher.create({
          data: { order_id: order.id, voucher_id: voucher.id },
        });
      }
      if (appliedFreeshipVoucherId) {
        await reserveVoucher(
          tx,
          appliedFreeshipVoucherId,
          "Voucher freeship đã được sử dụng hoặc đang bị khóa.",
        );
      }
      for (const voucherId of appliedAddonVoucherIds) {
        await reserveVoucher(
          tx,
          voucherId,
          "Voucher addon đã được sử dụng hoặc đang bị khóa.",
        );
      }
      for (const voucherId of appliedProductVoucherIds) {
        await reserveVoucher(
          tx,
          voucherId,
          "Voucher sản phẩm đã được sử dụng hoặc đang bị khóa.",
        );
      }
      return order;
    },
    { maxWait: 5000, timeout: 10000 },
  );
}
