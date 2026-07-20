import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { restoreVouchersOnCancel } from "@/lib/cancelOrder";

export const dynamic = "force-dynamic";

/** GET /api/admin/orders — List all orders with filters */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");
  const search = searchParams.get("search");
  const staffId = searchParams.get("staffId");
  const staffName = searchParams.get("staffName");
  const status = searchParams.get("status");
  const orderType = searchParams.get("order_type");
  
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));
  const skip = (page - 1) * limit;

  try {
    const where: Prisma.OrderWhereInput = {};

      // 1. Date range filter
      if (startDateStr || endDateStr) {
        where.created_at = {};
        if (startDateStr) {
          where.created_at.gte = new Date(startDateStr);
        }
        if (endDateStr) {
          where.created_at.lte = new Date(endDateStr);
        }
      }

      // 2. Staff filter
      if (staffId) {
        where.handled_by = staffId;
      } else if (staffName) {
        where.handler = {
          name: { contains: staffName, mode: "insensitive" },
        };
      }

    // 3. Search by customer name or phone — null-safe for anonymous orders
    if (search) {
      where.OR = [
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { phone_number: { contains: search } },
            ],
          },
        },
        // Match anonymous orders when searching for Vietnamese terms
        ...("khách vãng lai".includes(search.toLowerCase()) ? [{ user_id: null }] : []),
      ];
    }

    // 4. Status filter
    if (status) {
      where.status = status as Prisma.EnumOrderStatusFilter["equals"];
    } else if (orderType) {
      // Tab "Tại quầy" / "Khách đặt": exclude CANCELLED — it belongs only in the "Đã huỷ" tab
      where.status = { notIn: ["CANCELLED"] } as Prisma.EnumOrderStatusFilter;
    }

    // 5. Order Type filter (supports comma-separated values like PICKUP,DELIVERY)
    if (orderType) {
      const types = orderType.split(",").map((t) => t.trim());
      where.order_type = { in: types as any[] };
    }


    const [total, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
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
          user: { select: { name: true, phone_number: true } },
          handler: { select: { name: true } }, // Get the name of the staff who handled it
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
                      group: { select: { name: true } }
                    } 
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Lazy auto-cancel: expire any PENDING orders past their deadline.
    // Triggered on every admin list fetch — cron is daily safety net only.
    const now = new Date();
    const expiredOrders = orders.filter(
      (o) => o.status === "PENDING" && o.auto_cancel_at && o.auto_cancel_at <= now
    );
    if (expiredOrders.length > 0) {
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
              { maxWait: 5000, timeout: 10000 }
            );
            if (wasCancelled) {
              order.status = "CANCELLED"; // update in-memory for response
            }
          } catch (err) {
            console.error(`[GET /api/admin/orders lazy-cancel] Failed for order ${order.id}:`, err);
          }
        })
      );
    }

    return NextResponse.json({
      data: orders,
      meta: { total, page, totalPages }
    });
  } catch (err) {
    console.error("[GET /api/admin/orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
