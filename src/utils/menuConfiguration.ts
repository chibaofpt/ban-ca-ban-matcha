interface PowderConfigurationOption {
  id: string;
  name: string;
  price_per_gram: number;
  is_available: boolean;
}

interface BaseLiquidConfigurationOption {
  id: string;
  is_active: boolean;
  display_order: number;
}

const FUSION_POWDER_FALLBACK_NAMES = ["Meyumi", "Hana", "MH-3"] as const;

/** Resolve a Fusion powder deterministically from current active catalog data. */
export function resolveFusionDefaultPowderId(
  configuredPowderId: string | null,
  powders: PowderConfigurationOption[],
): string | null {
  const active = powders.filter((powder) => powder.is_available);
  if (configuredPowderId && active.some((powder) => powder.id === configuredPowderId)) {
    return configuredPowderId;
  }
  for (const name of FUSION_POWDER_FALLBACK_NAMES) {
    const preferred = active.find((powder) => powder.name.trim().toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"));
    if (preferred) return preferred.id;
  }
  return [...active].sort((left, right) =>
    left.price_per_gram - right.price_per_gram || left.id.localeCompare(right.id),
  )[0]?.id ?? null;
}

/** Resolve an active Base Liquid inside the item's current compatible allow-list. */
export function resolveDefaultBaseLiquidId(
  configuredBaseLiquidId: string | null,
  compatibleBaseLiquidIds: string[],
  baseLiquids: BaseLiquidConfigurationOption[],
): string | null {
  const compatible = new Set(compatibleBaseLiquidIds);
  const active = baseLiquids.filter((liquid) => liquid.is_active && compatible.has(liquid.id));
  if (configuredBaseLiquidId && active.some((liquid) => liquid.id === configuredBaseLiquidId)) {
    return configuredBaseLiquidId;
  }
  return [...active].sort((left, right) =>
    left.display_order - right.display_order || left.id.localeCompare(right.id),
  )[0]?.id ?? null;
}
