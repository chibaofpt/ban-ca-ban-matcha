import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { OrderType, Prisma } from "@prisma/client";
import { toPublicOrderDto } from "@/lib/orderPublicDto";
import { resolveStaffIdentifier } from "@/lib/publicIdentifiers";

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
  const excludeCancelled = searchParams.get("exclude_cancelled") === "true";
  
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
        const staff = await resolveStaffIdentifier(staffId);
        if (!staff) {
          return NextResponse.json(
            { error: "Staff not found", code: "NOT_FOUND" },
            { status: 404 },
          );
        }
        where.handled_by = staff.id;
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
    } else if (orderType || excludeCancelled) {
      // Non-cancelled tabs exclude CANCELLED — it belongs only in the "Đã huỷ" tab.
      where.status = { notIn: ["CANCELLED"] } as Prisma.EnumOrderStatusFilter;
    }

    // 5. Order Type filter (supports comma-separated values like PICKUP,DELIVERY)
    if (orderType) {
      const types = orderType.split(",").map((t) => t.trim());
      where.order_type = { in: types as OrderType[] };
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
          handler: { select: { name: true, role: true } },
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

    return NextResponse.json({
      data: orders.map((order) => toPublicOrderDto(order)),
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
