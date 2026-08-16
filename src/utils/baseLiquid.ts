import type { Category, MilkTypeOption } from "@/src/lib/types/menu";

export interface BaseLiquidItemConfig {
  category: Category;
  default_base_liquid_id?: string | null;
  allowed_base_liquid_ids?: string[];
}

/** Resolve the ordered, de-duplicated Base Liquid choices configured for one item. */
export function getBaseLiquidOptionsForItem(
  item: BaseLiquidItemConfig,
  activeLiquids: MilkTypeOption[],
): MilkTypeOption[] {
  if (!item.default_base_liquid_id) return [];
  const acceptedIds = new Set([
    item.default_base_liquid_id,
    ...(item.allowed_base_liquid_ids ?? []),
  ]);
  const byId = new Map(activeLiquids.map((liquid) => [liquid.id, liquid]));
  const defaultLiquid = byId.get(item.default_base_liquid_id);
  if (!defaultLiquid) return [];

  return [
    defaultLiquid,
    ...activeLiquids.filter(
      (liquid) => liquid.id !== defaultLiquid.id && acceptedIds.has(liquid.id),
    ),
  ];
}
