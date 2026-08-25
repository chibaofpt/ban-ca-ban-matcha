/**
 * GET /api/admin/voucher-packages — List all voucher packages (active and inactive)
 * POST /api/admin/voucher-packages — Create a new voucher package
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  buildPricingContext,
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
} from "@/lib/pricing";
import { invalidateVoucherCaches } from "@/lib/cacheInvalidation";
import { createVoucherPackageSchema } from "@/lib/validations/voucherPackage";
import {
  createBundleVoucherPackage,
  VoucherBundleReferenceError,
  type AdminVoucherBundleTransaction,
} from "@/lib/adminVoucherBundle";
import {
  createAddonVoucherPackage,
  VoucherAddonReferenceError,
  type AdminVoucherAddonDatabase,
} from "@/lib/adminVoucherAddon";
import { toVoucherPackageBundleDto } from "@/lib/voucherBundleDto";
import {
  resolveDefaultBaseLiquidId,
  resolveFusionDefaultPowderId,
} from "@/src/utils/menuConfiguration";

export const dynamic = "force-dynamic";

// ── Validation schema ─────────────────────────────────────────────────────────

  // PRODUCT package — server auto-calculates covered_price_vnd from pricing engine
  // ADDON package — free a single addon option
  // FREESHIP package — covers delivery shipping fee up to covered_delivery_fee_vnd. DELIVERY only.

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
        menuItemScopes: { include: { menuItem: { select: { name: true, category: true, is_available: true, is_seasonal: true } } } },
        addonOption: { select: { label: true } },
        bundleRule: { include: {
          productScopes: { include: {
            sizes: true,
            menuItem: { select: { name: true, category: true, is_available: true } },
          } },
          addonRewards: true,
        } },
        _count: { select: { vouchers: true } },
      },
    });

    return NextResponse.json({ data: packages.map(toVoucherPackageBundleDto) });
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
  const parsed = createVoucherPackageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const data = parsed.data;

    if (data.voucher_type === "BUNDLE") {
      try {
        const pkg = await prisma.$transaction((tx) =>
          createBundleVoucherPackage(tx as unknown as AdminVoucherBundleTransaction, data),
        );
        await invalidateVoucherCaches();
        return NextResponse.json({
          data: toVoucherPackageBundleDto(pkg as Parameters<typeof toVoucherPackageBundleDto>[0]),
        }, { status: 201 });
      } catch (error) {
        if (error instanceof VoucherBundleReferenceError) {
          return NextResponse.json(
            { error: error.message, code: "BUSINESS_RULE_VIOLATION" },
            { status: 422 },
          );
        }
        throw error;
      }
    }

    if (data.voucher_type === "ITEM") {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: data.menu_item_id },
        select: { id: true, category: true, is_available: true, unit_price_vnd: true },
      });
      if (!menuItem || !menuItem.is_available) {
        return NextResponse.json({ error: "Menu item not found or unavailable", code: "NOT_FOUND" }, { status: 404 });
      }
      if (menuItem.category !== "extras") {
        return NextResponse.json({ error: "ITEM voucher chỉ áp dụng cho món Add-on", code: "VALIDATION_ERROR" }, { status: 400 });
      }
      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "ITEM",
          acquisition_mode: data.acquisition_mode,
          points_cost: data.points_cost,
          ends_at: data.ends_at ? new Date(data.ends_at) : null,
          is_active: true,
          expires_after_days: data.expires_after_days ?? null,
          quantity: data.quantity ?? null,
          max_per_user: data.max_per_user ?? 1,
          menu_item_id: data.menu_item_id,
        },
      });
      await invalidateVoucherCaches();
      return NextResponse.json({ data: pkg }, { status: 201 });
    }

    // For ADDON packages — ensure the target addon is not an Extra Matcha option (dynamic price)
    if (data.voucher_type === "ADDON") {
      try {
        const pkg = await createAddonVoucherPackage(
          prisma as unknown as AdminVoucherAddonDatabase,
          data,
        );
        await invalidateVoucherCaches();
        return NextResponse.json({ data: pkg }, { status: 201 });
      } catch (error) {
        if (error instanceof VoucherAddonReferenceError) {
          const status = error.reason === "NOT_FOUND" ? 404 : 400;
          return NextResponse.json({ error: error.message, code: error.reason }, { status });
        }
        throw error;
      }
    }

    // For PRODUCT packages — auto-calculate covered_price_vnd via pricing engine
    if (data.voucher_type === "PRODUCT") {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: data.menu_item_id },
        include: {
          sizes: true,
          fusionAllowedPowders: true,
          allowedBaseLiquids: {
            include: { baseLiquid: { select: { is_active: true } } },
          },
        },
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

      const pricingCtx = await buildPricingContext();
      const activePowders = pricingCtx.availablePowders.map((powder) => ({
        ...powder,
        is_available: true,
        price_per_gram: pricingCtx.powderPriceMap[powder.id] ?? Number.MAX_SAFE_INTEGER,
      }));

      // Resolve powder_id and premium_latte
      let powder_id: string;
      let premium_latte = 0;
      let resolved_matcha_powder_id: string | null = null;
      let resolved_milk_type_id: string | null = null;

      if (menuItem.category === "latte") {
        if (!menuItem.matcha_powder_id || !activePowders.some((powder) => powder.id === menuItem.matcha_powder_id)) {
          return NextResponse.json(
            { error: "Latte fixed powder is missing or inactive", code: "BUSINESS_RULE_VIOLATION" },
            { status: 422 }
          );
        }
        powder_id = menuItem.matcha_powder_id;
        // For Latte: milk_type_id is the custom swap (null = default milk)
      } else {
        const effectiveDefaultPowderId = resolveFusionDefaultPowderId(
          menuItem.default_powder_id,
          activePowders,
        );
        const selected_powder_id = data.matcha_powder_id ?? effectiveDefaultPowderId;

        if (!selected_powder_id) {
          return NextResponse.json(
            { error: "Fusion item has no resolvable powder", code: "VALIDATION_ERROR" },
            { status: 400 }
          );
        }

        // Validate the selected powder is allowed for this item
        if (data.matcha_powder_id && data.matcha_powder_id !== effectiveDefaultPowderId) {
          const activePowderIds = new Set(activePowders.map((powder) => powder.id));
          const allowedIds = menuItem.fusionAllowedPowders
            .map((entry) => entry.powder_id)
            .filter((id) => activePowderIds.has(id));
          if (!allowedIds.includes(data.matcha_powder_id)) {
            return NextResponse.json(
              { error: "Selected powder is not allowed or active for this fusion item", code: "BUSINESS_RULE_VIOLATION" },
              { status: 422 }
            );
          }
        }

        powder_id = selected_powder_id;
        resolved_matcha_powder_id = data.matcha_powder_id ?? null;

        // Compute Premium_Latte for non-default powder
        if (effectiveDefaultPowderId && powder_id !== effectiveDefaultPowderId) {
          premium_latte = await resolveOrderItemPremiumLatte(powder_id, effectiveDefaultPowderId, data.size);
        }
      }

      // Build pricing context and compute drink price
      const configuredBaseLiquidId = menuItem.category === "latte"
        ? pricingCtx.defaultBaseLiquidId ?? null
        : menuItem.default_base_liquid_id;
      const allowedBaseLiquidIds = menuItem.allowedBaseLiquids
        .filter((entry) => entry.baseLiquid.is_active)
        .map((entry) => entry.base_liquid_id);
      const defaultBaseLiquidId = resolveDefaultBaseLiquidId(
        configuredBaseLiquidId,
        [...(configuredBaseLiquidId ? [configuredBaseLiquidId] : []), ...allowedBaseLiquidIds],
        pricingCtx.availableBaseLiquids ?? [],
      );
      if (!defaultBaseLiquidId) {
        return NextResponse.json(
          { error: "Menu item has no Base Liquid default", code: "BUSINESS_RULE_VIOLATION" },
          { status: 422 },
        );
      }
      resolved_milk_type_id = data.milk_type_id ?? defaultBaseLiquidId;
      if (
        !pricingCtx.availableBaseLiquids?.some((liquid) => liquid.id === resolved_milk_type_id) ||
        (resolved_milk_type_id !== defaultBaseLiquidId && !allowedBaseLiquidIds.includes(resolved_milk_type_id))
      ) {
        return NextResponse.json(
          { error: "Selected Base Liquid is not allowed for this menu item", code: "BUSINESS_RULE_VIOLATION" },
          { status: 422 },
        );
      }
      const drink_price = resolveOrderItemPrice(
        {
          category: menuItem.category as "latte" | "fusion",
          size: data.size,
          base_price_vnd: sizeRow.base_price_vnd,
          custom_powder_grams: menuItem.custom_powder_grams as Record<string, number> | null,
          powder_id,
          base_liquid_id: resolved_milk_type_id,
          default_base_liquid_id: defaultBaseLiquidId,
          base_liquid_ml: sizeRow.base_liquid_ml,
          premium_latte,
        },
        pricingCtx
      );

      if (data.included_addon_option_ids.length > 0) {
        const addonOptions = await prisma.addonOption.findMany({
          where: {
            id: { in: data.included_addon_option_ids },
            is_active: true,
            group: { is_active: true },
          },
          select: { id: true, gram_value: true },
        });

        if (addonOptions.length !== data.included_addon_option_ids.length) {
          return NextResponse.json(
            { error: "One or more addon options not found", code: "NOT_FOUND" },
            { status: 404 }
          );
        }

        if (addonOptions.some((addon) => addon.gram_value !== null)) {
          return NextResponse.json(
            { error: "PRODUCT vouchers cannot include dynamic-price addons", code: "VALIDATION_ERROR" },
            { status: 400 },
          );
        }
      }

      // covered_price_vnd = drink price only (PRODUCT covers drink, not addons)
      const covered_price_vnd = drink_price;

      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "PRODUCT",
          acquisition_mode: data.acquisition_mode,
          points_cost: data.points_cost,
          ends_at: data.ends_at ? new Date(data.ends_at) : null,
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
    if (data.voucher_type === "PRODUCT_DISCOUNT") {
      const targetIds = data.eligible_menu_item_ids ?? [data.menu_item_id];
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: targetIds } },
        include: { sizes: true },
      });
      if (menuItems.length !== targetIds.length || menuItems.some((item) =>
        !item.is_available || (item.category !== "latte" && item.category !== "fusion"))) {
        return NextResponse.json({ error: "Product discount requires an available drink", code: "BUSINESS_RULE_VIOLATION" }, { status: 422 });
      }
      const supportsSharedSizes = menuItems.every((item) => {
        const activeSizes = new Set(item.sizes.filter((row) => row.base_price_vnd !== null).map((row) => row.size));
        return data.eligible_sizes.every((size) => activeSizes.has(size)) &&
          (data.product_discount_mode !== "PAY_AS_SIZE" || (!!data.reference_size && activeSizes.has(data.reference_size)));
      });
      if (!supportsSharedSizes) {
        return NextResponse.json({ error: "Voucher size configuration is unavailable", code: "BUSINESS_RULE_VIOLATION" }, { status: 422 });
      }
      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name, description: data.description ?? null, voucher_type: "PRODUCT_DISCOUNT",
          acquisition_mode: data.acquisition_mode, points_cost: data.points_cost,
          ends_at: data.ends_at ? new Date(data.ends_at) : null, is_active: true,
          expires_after_days: data.expires_after_days ?? null, quantity: data.quantity ?? null,
          max_per_user: data.max_per_user ?? 1, menu_item_id: targetIds[0],
          menuItemScopes: { create: targetIds.map((menu_item_id) => ({ menu_item_id })) },
          product_discount_mode: data.product_discount_mode, eligible_sizes: [...data.eligible_sizes],
          reference_size: data.product_discount_mode === "PAY_AS_SIZE" ? data.reference_size : null,
          discount_type: data.product_discount_mode === "FIXED_AMOUNT" ? "FIXED" : null,
          discount_value: data.product_discount_mode === "FIXED_AMOUNT" ? data.discount_value : null,
          covered_price_vnd: null,
        },
      });
      await invalidateVoucherCaches();
      return NextResponse.json({ data: pkg }, { status: 201 });
    }

    if (data.voucher_type === "FREESHIP") {
      const pkg = await prisma.voucherPackage.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          voucher_type: "FREESHIP",
          acquisition_mode: data.acquisition_mode,
          points_cost: data.points_cost,
          ends_at: data.ends_at ? new Date(data.ends_at) : null,
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
        acquisition_mode: data.acquisition_mode,
        points_cost: data.points_cost,
        ends_at: data.ends_at ? new Date(data.ends_at) : null,
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
