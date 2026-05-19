import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

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

    const orders = await prisma.order.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        user: { select: { name: true, phone_number: true } },
        handler: { select: { name: true } }, // Get the name of the staff who handled it
        items: {
          include: {
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
    });

    return NextResponse.json({ data: orders });
  } catch (err) {
    console.error("[GET /api/admin/orders]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
