import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MenuData, MenuItem, MenuItemSize, MilkTypeOption, AddonGroup, AddonOption, MenuItemPowder } from "@/src/lib/types/menu";
import { withCache, CACHE_KEYS, CACHE_TTL } from "@/lib/cache";

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
              select: { id: true, name: true, type: true },
            },
          },
        }),
        prisma.addonGroup.findMany({
          where: { is_active: true },
          include: {
            options: { orderBy: { sort_order: "asc" } },
          },
        }),
        prisma.milkType.findMany({
          where: { is_active: true },
          orderBy: { display_order: "asc" },
        }),
        prisma.defaultSizeConfig.findMany(),
        prisma.matchaPowder.findMany({
          where: { is_available: true },
          select: { id: true, name: true, type: true },
        }),
      ]);

    // ── Build lookups ────────────────────────────────────────────────────────
    const milkMlMap: Record<string, number> = {};
    for (const c of defaultSizeConfigs) {
      milkMlMap[c.size] = c.milk_ml;
    }

    // Global addon groups shape (same for every item)
    const globalAddonGroups: AddonGroup[] = addonGroups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      is_required: g.is_required,
      min_quantity: g.min_quantity ?? null,
      max_quantity: g.max_quantity ?? null,
      options: g.options.map((o): AddonOption => ({
        id: o.id,
        label: o.label,
        price_vnd: o.price_vnd,
        gram_value: o.gram_value !== null ? Number(o.gram_value) : null,
        is_default: o.is_default,
        sort_order: o.sort_order,
      })),
    }));

    // Resolve Fusion default powder fallback order: Meyumi → Hana → MH-3 → cheapest
    const FALLBACK_NAMES = ["Meyumi", "Hana", "MH-3"];
    function resolveFusionDefaultPowderId(
      defaultPowderId: string | null
    ): string | null {
      // Check if explicitly set default powder is still available
      if (defaultPowderId && powders.some(p => p.id === defaultPowderId)) {
        return defaultPowderId;
      }
      for (const name of FALLBACK_NAMES) {
        const found = powders.find((p) => p.name === name);
        if (found) return found.id;
      }
      // cheapest available — powders already filtered is_available
      return powders.length > 0 ? powders[0].id : null;
    }

    // ── Build response ───────────────────────────────────────────────────────
    const latte: MenuItem[] = [];
    const fusion: MenuItem[] = [];
    const SIZE_ORDER: Record<string, number> = { M: 0, L: 1, XL: 2 };

    let maxUpdatedAt = new Date(0);
    for (const item of items) {
      // updated_at tracking — MenuItem has updated_at
      const updatedAt = (item as unknown as { updated_at: Date }).updated_at;
      if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

      // Sizes — exclude null base_price_vnd
      const sizes: MenuItemSize[] = item.sizes
        .filter((s) => s.base_price_vnd !== null)
        .map((s) => ({
          size: s.size,
          base_price_vnd: s.base_price_vnd as number,
          milk_ml: milkMlMap[s.size] ?? 0,
        }))
        .sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]);

      const menuItem: MenuItem = {
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        category: item.category as "latte" | "fusion",
        is_seasonal: item.is_seasonal,
        image_url: item.image_url ?? null,
        sort_order: item.sort_order,
        base_liquid_note: item.base_liquid_note ?? null,
        custom_powder_grams: item.custom_powder_grams as MenuItem["custom_powder_grams"],
        powder: null,
        resolved_default_powder_id: null,
        allowed_powder_ids: [],
        milk_types: [],
        sizes,
        addon_groups: globalAddonGroups,
      };

      if (item.category === "latte") {
        menuItem.powder = item.matchaPowder
          ? ({
              id: item.matchaPowder.id,
              name: item.matchaPowder.name,
              type: item.matchaPowder.type,
            } as MenuItemPowder)
          : null;
        menuItem.milk_types = milkTypes.map((m): MilkTypeOption => ({
          id: m.id,
          name: m.name,
          price_per_ml: m.price_per_ml,
          is_default: m.is_default,
          display_order: m.display_order,
        }));
        latte.push(menuItem);
      } else {
        menuItem.resolved_default_powder_id = resolveFusionDefaultPowderId(
          item.default_powder_id
        );
        menuItem.allowed_powder_ids = item.fusionAllowedPowders
          .filter((fp) => fp.matchaPowder.is_available)
          .map((fp) => fp.powder_id);
        fusion.push(menuItem);
      }
    }

    const allItems = [...latte, ...fusion];
    const seasonal = allItems.filter(item => item.is_seasonal);

    return {
      updated_at: maxUpdatedAt.toISOString(),
      latte,
      fusion,
      seasonal,
    } as unknown as MenuData;
}
