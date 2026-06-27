/**
 * GET /api/admin/voucher-packages — List all voucher packages (active and inactive)
 * POST /api/admin/voucher-packages — Create a new voucher package
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  buildPricingContext,
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
} from "@/lib/pricing";
import { invalidateVoucherCaches } from "@/lib/cacheInvalidation";

export const dynamic = "force-dynamic";

// ── Validation schema ─────────────────────────────────────────────────────────

const sizeEnum = z.enum(["M", "L", "XL"]);

/** Common quantity/limit fields for all package types. */
const quantityFields = {
  expires_after_days: z.number().int().min(1).optional().nullable(),
  /** NULL = unlimited. Max total vouchers that can be issued from this package. */
  quantity: z.number().int().min(1).optional().nullable(),
  /** Max per user. Defaults to 1. */
  max_per_user: z.number().int().min(1).optional().nullable(),
};

const createPackageSchema = z.discriminatedUnion("voucher_type", [
  // DISCOUNT package
  z.object({
    voucher_type: z.literal("DISCOUNT"),
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    points_cost: z.number().int().min(1),
    discount_type: z.enum(["PERCENT", "FIXED"]),
    discount_value: z.number().int().min(1),
    min_order_vnd: z.number().int().min(1000).optional().nullable(),
    ...quantityFields,
  }),
  // PRODUCT package — server auto-calculates covered_price_vnd from pricing engine
  z.object({
    voucher_type: z.literal("PRODUCT"),
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    points_cost: z.number().int().min(1),
    menu_item_id: z.string().uuid(),
    size: sizeEnum,
    /** Fusion: optional custom powder swap. Latte: ignored (server uses item's fixed powder). */
    matcha_powder_id: z.string().uuid().optional().nullable(),
    /** Latte: optional custom milk swap. Fusion: ignored. */
    milk_type_id: z.string().uuid().optional().nullable(),
    included_addon_option_ids: z.array(z.string().uuid()).default([]),
    ...quantityFields,
  }),
  // ADDON package — free a single addon option
  z.object({
    voucher_type: z.literal("ADDON"),
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    points_cost: z.number().int().min(1),
    addon_option_id: z.string().uuid(),
    ...quantityFields,
  }),
  // FREESHIP package — covers delivery shipping fee up to covered_delivery_fee_vnd. DELIVERY only.
  z.object({
    voucher_type: z.literal("FREESHIP"),
    name: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    points_cost: z.number().int().min(1),
    /** Maximum delivery fee this voucher will cover in VND. Minimum 1,000. */
    covered_delivery_fee_vnd: z.number().int().min(1000),
    /** Minimum order total (after discount, before ship) required. NULL = no minimum. */
    min_order_vnd: z.number().int().min(1000).optional().nullable(),
    ...quantityFields,
  }),
]);

// ── GET ───────────────────────────────────────────────────────────────────────

/** GET /api/admin/voucher-packages — List all voucher packages. */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const packages = await prisma.voucherPackage.findMany({
      orderBy: { created_at: "desc" },
      include: {
        menuItem: { select: { name: true, is_available: true } },
        addonOption: { select: { label: true } },
        _count: { select: { vouchers: true } },
      },
    });

    return NextResponse.json({ data: packages });
  } catch (err) {
    console.error("[GET /api/admin/voucher-packages]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

/** POST /api/admin/voucher-packages — Create a new voucher package. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;

    // For ADDON packages — ensure the target addon is not an Extra Matcha option (dynamic price)
    if (data.voucher_type === "ADDON") {
      const addonOption = await prisma.addonOption.findUnique({
        where: { id: data.addon_option_id },
        select: { gram_value: true, price_vnd: true, label: true },
      });

      if (!addonOption) {
        return NextResponse.json(
          { error: "Addon option not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      if (addonOption.gram_value !== null && Number(addonOption.gram_value) > 0) {
        return NextResponse.json(
          {
            error: "ADDON vouchers cannot target Extra Matcha options (dynamic price)",
            code: "VALIDATION_ERROR",
          },
          { status: 400 }
        );
      }

      // For ADDON: covered_price_vnd = the addon's current price_vnd (snapshot)
      const covered_price_vnd = addonOption.price_vnd;

      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "ADDON",
          points_cost: data.points_cost,
          is_active: true,
          expires_after_days: data.expires_after_days ?? null,
          quantity: data.quantity ?? null,
          max_per_user: data.max_per_user ?? 1,
          addon_option_id: data.addon_option_id,
          covered_price_vnd,
        },
      });

      await invalidateVoucherCaches();
      return NextResponse.json({ data: pkg }, { status: 201 });
    }

    // For PRODUCT packages — auto-calculate covered_price_vnd via pricing engine
    if (data.voucher_type === "PRODUCT") {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: data.menu_item_id },
        include: { sizes: true, fusionAllowedPowders: true },
      });

      if (!menuItem || !menuItem.is_available) {
        return NextResponse.json(
          { error: "Menu item not found or unavailable", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      const sizeRow = menuItem.sizes.find((s) => s.size === data.size);
      if (!sizeRow || sizeRow.base_price_vnd === null) {
        return NextResponse.json(
          { error: `Size ${data.size} is not available for this menu item`, code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }

      // Resolve powder_id and premium_latte
      let powder_id: string;
      let premium_latte = 0;
      let resolved_matcha_powder_id: string | null = null;
      let resolved_milk_type_id: string | null = null;

      if (menuItem.category === "latte") {
        if (!menuItem.matcha_powder_id) {
          return NextResponse.json(
            { error: "Latte item is missing matcha_powder_id", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }
        powder_id = menuItem.matcha_powder_id;
        // For Latte: milk_type_id is the custom swap (null = default milk)
        resolved_milk_type_id = data.milk_type_id ?? null;
      } else {
        // Fusion: use provided powder or item default
        const default_powder_id = menuItem.default_powder_id;
        const selected_powder_id = data.matcha_powder_id ?? default_powder_id;

        if (!selected_powder_id) {
          return NextResponse.json(
            { error: "Fusion item has no resolvable powder", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }

        // Validate the selected powder is allowed for this item
        if (data.matcha_powder_id && data.matcha_powder_id !== default_powder_id) {
          const allowedIds = menuItem.fusionAllowedPowders.map((p) => p.powder_id);
          if (!allowedIds.includes(data.matcha_powder_id)) {
            return NextResponse.json(
              { error: "Selected powder is not allowed for this fusion item", code: "VALIDATION_ERROR" },
              { status: 400 }
            );
          }
        }

        powder_id = selected_powder_id;
        resolved_matcha_powder_id = data.matcha_powder_id ?? null;

        // Compute Premium_Latte for non-default powder
        if (default_powder_id && powder_id !== default_powder_id) {
          premium_latte = await resolveOrderItemPremiumLatte(powder_id, default_powder_id, data.size as "M" | "L" | "XL");
        }
      }

      // Build pricing context and compute drink price
      const pricingCtx = await buildPricingContext();
      const drink_price = resolveOrderItemPrice(
        {
          category: menuItem.category as "latte" | "fusion",
          size: data.size as "M" | "L" | "XL",
          base_price_vnd: sizeRow.base_price_vnd,
          custom_powder_grams: menuItem.custom_powder_grams as Record<string, number> | null,
          powder_id,
          milk_type_id: menuItem.category === "latte" ? resolved_milk_type_id : null,
          premium_latte,
        },
        pricingCtx
      );

      // Compute total included addon price
      let total_addon_price = 0;
      if (data.included_addon_option_ids.length > 0) {
        const addonOptions = await prisma.addonOption.findMany({
          where: { id: { in: data.included_addon_option_ids } },
          select: { id: true, price_vnd: true, gram_value: true },
        });

        if (addonOptions.length !== data.included_addon_option_ids.length) {
          return NextResponse.json(
            { error: "One or more addon options not found", code: "NOT_FOUND" },
            { status: 404 }
          );
        }

        for (const addon of addonOptions) {
          if (addon.gram_value !== null && Number(addon.gram_value) > 0) {
            // Extra matcha: price = ceil(gram_value × price_per_gram, 1000)
            const pricePerGram = pricingCtx.powderPriceMap[powder_id] ?? 0;
            const rawCost = Number(addon.gram_value) * pricePerGram;
            total_addon_price += Math.ceil(rawCost / 1000) * 1000;
          } else {
            total_addon_price += addon.price_vnd;
          }
        }
      }

      // covered_price_vnd = drink price + included addon total
      const covered_price_vnd = drink_price + total_addon_price;

      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "PRODUCT",
          points_cost: data.points_cost,
          is_active: true,
          expires_after_days: data.expires_after_days ?? null,
          quantity: data.quantity ?? null,
          max_per_user: data.max_per_user ?? 1,
          menu_item_id: data.menu_item_id,
          size: data.size,
          matcha_powder_id: resolved_matcha_powder_id,
          milk_type_id: resolved_milk_type_id,
          included_addon_option_ids: data.included_addon_option_ids,
          covered_price_vnd,
        },
      });

      await invalidateVoucherCaches();
      return NextResponse.json({ data: pkg }, { status: 201 });
    }

    // FREESHIP package — placeholder for delivery fee discount (Phase 5+)
    if (data.voucher_type === "FREESHIP") {
      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "FREESHIP",
          points_cost: data.points_cost,
          is_active: true,
          expires_after_days: data.expires_after_days ?? null,
          quantity: data.quantity ?? null,
          max_per_user: data.max_per_user ?? 1,
          covered_delivery_fee_vnd: data.covered_delivery_fee_vnd,
          min_order_vnd: data.min_order_vnd ?? null,
        },
      });

      await invalidateVoucherCaches();
      return NextResponse.json({ data: pkg }, { status: 201 });
    }

    // DISCOUNT package
    const pkg = await prisma.voucherPackage.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        voucher_type: "DISCOUNT",
        points_cost: data.points_cost,
        is_active: true,
        expires_after_days: data.expires_after_days ?? null,
        quantity: data.quantity ?? null,
        max_per_user: data.max_per_user ?? 1,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        min_order_vnd: data.min_order_vnd ?? null,
      },
    });

    await invalidateVoucherCaches();
    return NextResponse.json({ data: pkg }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/voucher-packages]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
