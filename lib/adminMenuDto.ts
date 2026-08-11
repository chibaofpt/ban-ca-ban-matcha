import type { Prisma } from "@prisma/client";

/** Shared Prisma relations required by admin menu responses. */
export const ADMIN_MENU_INCLUDE = {
  sizes: { orderBy: { size: "asc" as const } },
  matchaPowder: { select: { id: true, name: true, type: true } },
  defaultPowder: { select: { id: true, name: true, type: true } },
  fusionAllowedPowders: {
    include: {
      matchaPowder: { select: { id: true, is_available: true } },
    },
  },
} satisfies Prisma.MenuItemInclude;

export type AdminMenuItemRecord = Prisma.MenuItemGetPayload<{
  include: typeof ADMIN_MENU_INCLUDE;
}>;

const SIZE_ORDER: Record<string, number> = { SMALL: 0, MEDIUM: 1, LARGE: 2 };

/** Format a Prisma menu item row into the public admin API shape. */
export function formatAdminMenuItem(
  item: AdminMenuItemRecord,
  milkMlMap: Record<string, number>,
) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    category: item.category,
    is_seasonal: item.is_seasonal,
    image_url: item.image_url ?? null,
    is_available: item.is_available,
    sort_order: item.sort_order,
    base_liquid_note: item.base_liquid_note ?? null,
    custom_powder_grams: item.custom_powder_grams ?? null,
    updated_at: item.updated_at,
    matcha_powder_id: item.matcha_powder_id ?? null,
    powder: item.matchaPowder ?? null,
    default_powder_id: item.default_powder_id ?? null,
    default_powder: item.defaultPowder ?? null,
    allowed_powder_ids: item.fusionAllowedPowders
      .filter((entry) => entry.matchaPowder.is_available)
      .map((entry) => entry.powder_id),
    sizes: item.sizes
      .map((size) => ({
        size: size.size,
        base_price_vnd: size.base_price_vnd,
        milk_ml: milkMlMap[size.size] ?? 0,
      }))
      .sort((a, b) => SIZE_ORDER[a.size] - SIZE_ORDER[b.size]),
  };
}
