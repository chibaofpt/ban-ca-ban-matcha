import { NextResponse } from "next/server";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";
import { prisma } from "@/lib/prisma";
import { buildVietQRUrl } from "@/lib/vietqr";

async function cancelExpiredOrders<
  T extends { id: string; status: string; auto_cancel_at: Date | null },
>(orders: T[]): Promise<void> {
  const now = new Date();
  const expiredOrders = orders.filter(
    (order) =>
      order.status === "PENDING" &&
      order.auto_cancel_at !== null &&
      order.auto_cancel_at <= now,
  );
  await Promise.all(
    expiredOrders.map(async (order) => {
      try {
        const wasCancelled = await prisma.$transaction(
          async (tx) => {
            const claim = await tx.order.updateMany({
              where: { id: order.id, status: "PENDING" },
              data: { status: "CANCELLED" },
            });
            if (claim.count !== 1) return false;
            await restoreVouchersOnCancel(tx, order.id);
            return true;
          },
          { maxWait: 5000, timeout: 10000 },
        );
        if (wasCancelled) order.status = "CANCELLED";
      } catch (error) {
        console.error("[GET /api/orders lazy-cancel] Failed", {
          name: error instanceof Error ? error.name : typeof error,
        });
      }
    }),
  );
}

/** Fetches, lazily cancels, and maps one page of customer order history. */
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

  await cancelExpiredOrders(orders);
  const data = orders.map((order) => {
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
      items,
      ...publicOrder
    } = order;
    void userIdToRemove;
    void handledByToRemove;
    void confirmedByToRemove;
    void freeshipVoucherIdToRemove;
    return {
      ...publicOrder,
      discountVouchers: (discountVouchers ?? []).map(({ voucher }) => ({
        voucher: { package: voucher.package },
      })),
      items: (items ?? []).map((item) => {
        const {
          product_voucher_id: productVoucherIdToRemove,
          item_voucher_id: itemVoucherIdToRemove,
          addonVouchers,
          ...publicItem
        } = item;
        void productVoucherIdToRemove;
        void itemVoucherIdToRemove;
        return {
          ...publicItem,
          productVoucher: (item.productVoucher ?? item.itemVoucher)
            ? { package: (item.productVoucher ?? item.itemVoucher)!.package }
            : null,
          addonVouchers: (addonVouchers ?? []).map(({ voucher, discount_applied_vnd }) => ({
            discount_applied_vnd,
            voucher: { package: voucher.package },
          })),
        };
      }),
      payment_qr_url: paymentQrUrl,
    };
  });

  return NextResponse.json({
    data,
    meta: { total, page, totalPages: Math.ceil(total / limit) },
  });
}
