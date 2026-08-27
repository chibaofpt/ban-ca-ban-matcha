import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildVietQRUrl } from "@/lib/vietqr";

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
