import { NextResponse } from "next/server";
import type {
  CustomerHistoryOrder,
  CustomerHistoryOrderItem,
} from "@/contracts/order";
import { prisma } from "@/lib/prisma";
import { serializeOrderDate, toOrderItemDetail } from "@/lib/orderPublicDto";
import { buildVietQRUrl } from "@/lib/vietqr";

const ORDER_REWARD_REASONS = [
  "order_complete",
  "voucher_surplus",
  "order_complete_reversed",
  "voucher_surplus_reversed",
] as const;
const ORDER_REWARD_REASON_SET = new Set<string>(ORDER_REWARD_REASONS);

/** Calculate the net customer-visible points awarded by one order. */
export function calculateOrderPointsAwarded(
  logs: ReadonlyArray<{ reason: string; delta: number }> = [],
  completedOrderPointsFallback = 0,
): number {
  const hasOrderCompleteLog = logs.some((log) => log.reason === "order_complete");
  return Math.max(0, logs.reduce(
    (total, log) => ORDER_REWARD_REASON_SET.has(log.reason) ? total + log.delta : total,
    hasOrderCompleteLog ? 0 : Math.max(0, completedOrderPointsFallback),
  ));
}

/** Fetches and maps one read-only page of customer order history. */
export async function getCustomerOrderHistory(
  userId: string,
  page: number,
  limit: number,
  /** 'cancelled' → only CANCELLED orders; 'active' → exclude CANCELLED; omit → all */
  statusFilter?: "active" | "cancelled",
): Promise<NextResponse> {
  const skip = (page - 1) * limit;
  const statusWhere =
    statusFilter === "cancelled"
      ? { status: "CANCELLED" as const }
      : statusFilter === "active"
        ? { NOT: { status: "CANCELLED" as const } }
        : {};
  const baseWhere = { user_id: userId, ...statusWhere };

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where: baseWhere }),
    prisma.order.findMany({
      where: baseWhere,
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        discountVouchers: {
          include: { voucher: { include: { package: { select: { name: true } } } } },
        },
        pointsLogs: {
          where: { reason: { in: [...ORDER_REWARD_REASONS] } },
          select: { reason: true, delta: true },
        },
        items: {
          include: {
            productVoucher: {
              include: { package: { select: { name: true } } },
            },
            itemVoucher: {
              include: { package: { select: { name: true } } },
            },
            addonVouchers: {
              include: {
                voucher: { include: { package: { select: { name: true } } } },
              },
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
    }),
  ]);

  const data: CustomerHistoryOrder[] = orders.map((order) => {
    let paymentQrUrl: string | null = null;
    if (order.status === "PENDING" && order.order_code && order.order_type !== "COUNTER") {
      try {
        paymentQrUrl = buildVietQRUrl({
          amount: order.grand_total_vnd || order.total_vnd,
          orderCode: order.order_code,
        });
      } catch {
        paymentQrUrl = null;
      }
    }
    const {
      user_id: userIdToRemove,
      handled_by: handledByToRemove,
      payment_confirmed_by: confirmedByToRemove,
      freeship_voucher_id: freeshipVoucherIdToRemove,
      discountVouchers,
      pointsLogs,
      items,
      ...publicOrder
    } = order;
    void userIdToRemove;
    void handledByToRemove;
    void confirmedByToRemove;
    void freeshipVoucherIdToRemove;
    return {
      ...publicOrder,
      pickup_time: serializeOrderDate(order.pickup_time),
      created_at: serializeOrderDate(order.created_at),
      updated_at: serializeOrderDate(order.updated_at),
      auto_cancel_at: serializeOrderDate(order.auto_cancel_at),
      points_earned: calculateOrderPointsAwarded(
        pointsLogs,
        order.status === "COMPLETED" ? order.points_earned ?? 0 : 0,
      ),
      discountVouchers: (discountVouchers ?? []).map(({ voucher }) => ({
        voucher: { package: voucher.package },
      })),
      items: (items ?? []).map((item): CustomerHistoryOrderItem => {
        const publicItem = toOrderItemDetail(item);
        return {
          ...publicItem,
          menu_item_id: item.menu_item_id,
          selected_powder_id: item.selected_powder_id,
          selected_milk_type_id: item.selected_milk_type_id,
          selectedPowder: item.selectedPowder
            ? {
                name: item.selectedPowder.name,
                price_per_gram: item.selectedPowder.price_per_gram.toString(),
              }
            : null,
          productVoucher: publicItem.productVoucher ?? publicItem.itemVoucher ?? null,
        };
      }),
      payment_qr_url: paymentQrUrl,
    } satisfies CustomerHistoryOrder;
  });

  return NextResponse.json({
    data,
    meta: { total, page, totalPages: Math.ceil(total / limit) },
  });
}
