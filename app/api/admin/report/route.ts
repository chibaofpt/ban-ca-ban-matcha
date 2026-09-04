import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportQuerySchema } from "@/lib/validations/report";
import { resolveStaffIdentifier } from "@/lib/publicIdentifiers";
import {
  buildAdminReport,
  type RawAdminOrder,
  type RawAdminOrderItem,
  type PowderSizeEntry,
  type DefaultSizeEntry,
} from "@/lib/reportAggregation";
import { checkRateLimit } from "@/lib/rateLimit";
import { collectReportPages, ReportRangeTooLargeError } from "@/lib/reportPagination";

/** GET /api/admin/report — Generate full admin report with addon usage, revenue by type, and top products */
export async function GET(req: NextRequest) {
  // 1. Validate query params
  const { searchParams } = req.nextUrl;
  const rawQuery = {
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    staffId: searchParams.get("staffId") ?? undefined,
  };

  const parsed = reportQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // 2. Authenticate
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // 3. Role check — ADMIN only
  if (session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  const limit = await checkRateLimit("reportAccount", session.id);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const { startDate, endDate, staffId } = parsed.data;

  // 4. Build date range in Asia/Ho_Chi_Minh (UTC+7)
  const startIso = new Date(`${startDate}T00:00:00+07:00`);
  const endIso = new Date(new Date(`${endDate}T00:00:00+07:00`).getTime() + 86_400_000);

  try {
    return await prisma.$transaction(async (tx) => {
    const staff = staffId ? await resolveStaffIdentifier(staffId, tx) : null;
    if (staffId && !staff) {
      return NextResponse.json({ error: "Staff not found", code: "NOT_FOUND" }, { status: 404 });
    }
    const handledByFilter = staff?.id;
    // 6. Fetch completed orders with all required relations — includes order_type and addon label/group
    const where = {
      status: "COMPLETED" as const,
      created_at: { gte: startIso, lt: endIso },
      ...(handledByFilter ? { handled_by: handledByFilter } : {}),
    };
    const orders = await collectReportPages(
      () => tx.order.count({ where }),
      (skip, take) => tx.order.findMany({
      skip,
      take,
      orderBy: { id: "asc" },
      where: {
        status: "COMPLETED",
        created_at: { gte: startIso, lt: endIso },
        ...(handledByFilter ? { handled_by: handledByFilter } : {}),
      },
      select: {
        total_vnd: true,
        order_type: true,
        items: {
          select: {
            menu_item_id: true,
            quantity: true,
            size: true,
            selected_powder_id: true,
            selected_milk_type_id: true,
            base_liquid_ml: true,
            menuItem: {
              select: {
                name: true,
                category: true,
                matcha_powder_id: true,
                custom_powder_grams: true,
                sizes: { select: { size: true, base_liquid_ml: true } },
              },
            },
            addons: {
              select: {
                addon_option_id: true,
                quantity: true,
                unit_price_vnd: true,
                addonOption: {
                  select: {
                    label: true,
                    gram_value: true,
                    group: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    }));

    // 7. Fetch lookup tables
    const [defaultSizeConfigs, powderSizeConfigs, powders, milkTypes] =
      await Promise.all([
        tx.defaultSizeConfig.findMany(),
        tx.powderSizeConfig.findMany(),
        tx.matchaPowder.findMany({
          select: { id: true, name: true },
        }),
        tx.milkType.findMany({
          select: { id: true, name: true },
        }),
      ]);

    // 8. Convert Prisma Decimal → number at the boundary
    const defaultSizeEntries: DefaultSizeEntry[] = defaultSizeConfigs.map(
      (d: { size: "SMALL" | "MEDIUM" | "LARGE"; milk_ml: number; powder_gram: { toNumber(): number } }) => ({
        size: d.size,
        milk_ml: d.milk_ml,
        powder_gram: Number(d.powder_gram),
      })
    );

    const powderSizeEntries: PowderSizeEntry[] = powderSizeConfigs.map(
      (p: { powder_id: string; size: "SMALL" | "MEDIUM" | "LARGE"; grams: { toNumber(): number } }) => ({
        powder_id: p.powder_id,
        size: p.size,
        grams: Number(p.grams),
      })
    );

    // 9. Normalize order items (convert Decimal, parse JSON)
    const rawOrders: RawAdminOrder[] = orders.map((order: {
      total_vnd: number;
      order_type: string;
      items: Array<{
        menu_item_id: string;
        quantity: number;
        size: "SMALL" | "MEDIUM" | "LARGE" | null;
        selected_powder_id: string | null;
        selected_milk_type_id: string | null;
        base_liquid_ml: number | null;
        menuItem: {
          name: string;
          category: string;
          matcha_powder_id: string | null;
          custom_powder_grams: unknown;
          sizes: Array<{ size: "SMALL" | "MEDIUM" | "LARGE"; base_liquid_ml: number | null }>;
        };
        addons: Array<{
          addon_option_id: string;
          quantity: number;
          unit_price_vnd: number;
          addonOption: {
            label: string;
            gram_value: { toNumber(): number } | null;
            group: { name: string } | null;
          };
        }>;
      }>;
    }) => ({
      total_vnd: order.total_vnd,
      order_type: order.order_type as "COUNTER" | "PICKUP" | "DELIVERY",
      items: order.items.map((item): RawAdminOrderItem => {
        // custom_powder_grams is a JSON field — may be Record<string, number> or null
        let customGrams: Record<string, number> | null = null;
        if (
          item.menuItem.custom_powder_grams &&
          typeof item.menuItem.custom_powder_grams === "object" &&
          !Array.isArray(item.menuItem.custom_powder_grams)
        ) {
          customGrams = item.menuItem.custom_powder_grams as Record<string, number>;
        }

        return {
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          size: item.size,
          selected_powder_id: item.selected_powder_id,
          selected_milk_type_id: item.selected_milk_type_id,
          base_liquid_ml: item.base_liquid_ml,
          menuItem: {
            name: item.menuItem.name,
            category: item.menuItem.category,
            matcha_powder_id: item.menuItem.matcha_powder_id,
            custom_powder_grams: customGrams,
            sizes: item.menuItem.sizes,
          },
          addons: item.addons.map((addon) => ({
            addon_option_id: addon.addon_option_id,
            quantity: addon.quantity,
            unit_price_vnd: addon.unit_price_vnd,
            addonOption: {
              label: addon.addonOption.label,
              gram_value:
                addon.addonOption.gram_value != null
                  ? Number(addon.addonOption.gram_value)
                  : null,
              group: addon.addonOption.group,
            },
          })),
        };
      }),
    }));

    // 10. Build admin report using extended aggregation function
    const report = buildAdminReport(
      rawOrders,
      powders,
      milkTypes,
      powderSizeEntries,
      defaultSizeEntries
    );

    return NextResponse.json({ data: report });
    }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
  } catch (error) {
    if (error instanceof ReportRangeTooLargeError) {
      return NextResponse.json(
        { error: "Report range too large", code: "BUSINESS_RULE_VIOLATION", details: { reason: "REPORT_RANGE_TOO_LARGE" } },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
