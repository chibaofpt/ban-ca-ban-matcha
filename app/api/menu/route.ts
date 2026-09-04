import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MenuData, MenuItem, MenuItemSize, MilkTypeOption, AddonGroup, AddonOption, MenuItemPowder } from "@/src/lib/types/menu";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";
import {
  resolveDefaultBaseLiquidId,
  resolveFusionDefaultPowderId,
} from "@/src/utils/menuConfiguration";

/** GET /api/menu — public, no auth required. */
export async function GET(): Promise<NextResponse> {
  try {
    const menuData = await withCache<MenuData>(CACHE_KEYS.MENU, CACHE_TTL.MENU, fetchMenuData);
    return NextResponse.json({ data: menuData });
  } catch (err) {
    console.error("[GET /api/menu]", err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

/** Fetches and builds the full menu data from DB. Called by withCache on cache miss. */
async function fetchMenuData(): Promise<MenuData> {
    // ── Parallel data fetch ──────────────────────────────────────────────────
    const [items, addonGroups, milkTypes, defaultSizeConfigs, powders] =
      await Promise.all([
        prisma.menuItem.findMany({
          where: { is_available: true },
          orderBy: { sort_order: "asc" },
          include: {
            sizes: true,
            fusionAllowedPowders: {
              include: {
                matchaPowder: { select: { id: true, is_available: true } },
              },
            },
            matchaPowder: {
              select: { id: true, name: true, type: true, is_available: true },
            },
            allowedBaseLiquids: {
              include: {
                baseLiquid: { select: { id: true, is_active: true } },
              },
            },
          },
        }),
        prisma.addonGroup.findMany({
          where: { is_active: true },
          include: {
            options: {
              where: { is_active: true },
              orderBy: { sort_order: "asc" },
            },
          },
        }),
        prisma.milkType.findMany({
          where: { is_active: true },
          orderBy: { display_order: "asc" },
        }),
        prisma.defaultSizeConfig.findMany(),
        prisma.matchaPowder.findMany({
          where: { is_available: true },
          select: { id: true, name: true, type: true, price_per_gram: true, is_available: true },
        }),
      ]);

    // ── Build lookups ────────────────────────────────────────────────────────
    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) {
      milkMlMap[c.size] = c.milk_ml;
    }

    // Global addon groups shape returned once at MenuData level
    const globalAddonGroups: AddonGroup[] = addonGroups
      .filter((g) => g.options.length > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        image_url: g.image_url ?? null,
        max_select: g.max_select,
        is_dynamic_gram: g.is_dynamic_gram,
        options: g.options.map((o): AddonOption => ({
          id: o.id,
          label: o.label,
          image_url: o.image_url ?? null,
          price_vnd: o.price_vnd,
          gram_value: o.gram_value !== null ? Number(o.gram_value) : null,
          sort_order: o.sort_order,
        })),
      }));

    const globalMilkTypes: MilkTypeOption[] = milkTypes.map((m) => ({
      id: m.id,
      name: m.name,
      price_per_ml: m.price_per_ml,
      is_default: m.is_default,
      display_order: m.display_order,
      image_url: m.image_url ?? null,
    }));
    const globalDefaultBaseLiquidId =
      globalMilkTypes.find((liquid) => liquid.is_default)?.id ?? null;

    // ── Build response ───────────────────────────────────────────────────────
    const latte: MenuItem[] = [];
    const fusion: MenuItem[] = [];
    const extras: MenuItem[] = [];
    const SIZE_ORDER: Record<string, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2 };

    let maxUpdatedAt = new Date(0);
    for (const item of items) {
      const updatedAt = item.updated_at;
      if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

      // Sizes — exclude null base_price_vnd
      const sizes: MenuItemSize[] = item.sizes
        .filter((s) => s.base_price_vnd !== null)
        .map((s) => ({
          size: s.size,
          base_price_vnd: s.base_price_vnd as number,
          milk_ml: s.base_liquid_ml ?? milkMlMap[s.size] ?? 0,
          base_liquid_ml: s.base_liquid_ml ?? milkMlMap[s.size] ?? 0,
        }))
        .sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]);

      const menuItem: MenuItem = {
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        category: item.category as "latte" | "fusion" | "extras",
        unit_price_vnd: item.unit_price_vnd ?? null,
        is_seasonal: item.is_seasonal,
        image_url: item.image_url ?? null,
        sort_order: item.sort_order,
        base_liquid_note: item.base_liquid_note ?? null,
        custom_powder_grams: item.custom_powder_grams as MenuItem["custom_powder_grams"],
        powder: null,
        resolved_default_powder_id: null,
        allowed_powder_ids: [],
        default_base_liquid_id: null,
        allowed_base_liquid_ids: (item.allowedBaseLiquids ?? [])
          .filter((entry) => entry.baseLiquid.is_active)
          .map((entry) => entry.base_liquid_id),
        sizes,
      };
      const configuredBaseLiquidId = item.category === "latte"
        ? globalDefaultBaseLiquidId
        : item.default_base_liquid_id;
      const compatibleBaseLiquidIds = [
        ...(configuredBaseLiquidId ? [configuredBaseLiquidId] : []),
        ...(menuItem.allowed_base_liquid_ids ?? []),
      ];
      menuItem.default_base_liquid_id = resolveDefaultBaseLiquidId(
        configuredBaseLiquidId,
        compatibleBaseLiquidIds,
        milkTypes,
      );

      if (item.category === "latte") {
        if (!item.matchaPowder?.is_available) continue;
        menuItem.powder = item.matchaPowder
          ? ({
              id: item.matchaPowder.id,
              name: item.matchaPowder.name,
              type: item.matchaPowder.type,
            } as MenuItemPowder)
          : null;
        latte.push(menuItem);
      } else if (item.category === "fusion") {
        menuItem.resolved_default_powder_id = resolveFusionDefaultPowderId(
          item.default_powder_id,
          powders,
        );
        menuItem.allowed_powder_ids = item.fusionAllowedPowders
          .filter((fp) => fp.matchaPowder.is_available)
          .map((fp) => fp.powder_id);
        fusion.push(menuItem);
      } else if (item.category === "extras") {
        const extraMenuItem: Record<string, unknown> = { ...menuItem, sizes: [] };
        delete extraMenuItem.powder;
        delete extraMenuItem.resolved_default_powder_id;
        delete extraMenuItem.allowed_powder_ids;
        delete extraMenuItem.default_base_liquid_id;
        delete extraMenuItem.allowed_base_liquid_ids;
        extras.push(extraMenuItem as unknown as MenuItem);
      }
    }

    return {
      updated_at: maxUpdatedAt.toISOString(),
      latte,
      fusion,
      extras,
      milk_types: globalMilkTypes,
      base_liquids: globalMilkTypes,
      addon_groups: globalAddonGroups,
    };
}
