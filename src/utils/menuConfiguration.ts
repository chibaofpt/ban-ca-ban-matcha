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

/** Resolve only the original Fusion powder or its explicit admin-selected replacement. */
export function resolveFusionDefaultPowderId(
  configuredPowderId: string | null,
  powders: PowderConfigurationOption[],
  replacementPowderId: string | null = null,
): string | null {
  if (!configuredPowderId) return null;
  const active = powders.filter((powder) => powder.is_available);
  if (active.some((powder) => powder.id === configuredPowderId)) return configuredPowderId;
  return replacementPowderId && active.some((powder) => powder.id === replacementPowderId)
    ? replacementPowderId
    : null;
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
