/**
 * Pure pricing functions for Bạn Cá Bán Matcha.
 * NO imports from lib/, src/services/, or src/lib/ — receives plain data objects only.
 * Used by: frontend real-time estimates AND lib/pricing.ts (server order-time validation).
 */

export type Size = "M" | "L" | "XL";

export interface CustomPowderGrams {
  M?: number;
  L?: number;
  XL?: number;
}

export interface PowderSizeConfigEntry {
  size: Size;
  grams: number;
}

export interface DefaultSizeConfigEntry {
  size: Size;
  milk_ml: number;
  powder_gram: number;
}

// ── Rounding ──────────────────────────────────────────────────────────────────

/** Rounds up to nearest 1,000 VND. Math.ceil(x / 1000) * 1000. */
export function ceilTo1000(vnd: number): number {
  return Math.ceil(vnd / 1000) * 1000;
}

// ── Gram resolution ───────────────────────────────────────────────────────────

/**
 * Resolves gram quantity for a given size using 3-level COALESCE:
 * 1. menu_item.custom_powder_grams[size]
 * 2. powder_size_config for this powder+size
 * 3. default_size_config.powder_gram (system fallback)
 */
export function resolveGram(
  size: Size,
  customPowderGrams: CustomPowderGrams | null | undefined,
  powderSizeConfigs: PowderSizeConfigEntry[],
  defaultSizeConfigs: { size: Size; powder_gram?: number; grams?: number }[]
): number {
  // Level 1
  if (customPowderGrams?.[size] !== undefined && customPowderGrams[size] !== null) {
    return customPowderGrams[size] as number;
  }
  // Level 2
  const powderConfig = powderSizeConfigs.find((c) => c.size === size);
  if (powderConfig !== undefined) {
    return Number(powderConfig.grams);
  }
  // Level 3
  const defaultConfig = defaultSizeConfigs.find((c) => c.size === size);
  return Number(defaultConfig?.powder_gram ?? defaultConfig?.grams ?? 0);
}

// ── Latte price ───────────────────────────────────────────────────────────────

export interface LattePriceParams {
  base_price_vnd: number;
  gram: number;
  powder_price_per_gram: number;
  milk_ml: number;
  milk_price_per_ml: number;
}

/**
 * Computes final Latte price.
 * Formula: ceil(base + gram × price_per_gram + milk_ml × price_per_ml, 1000)
 */
export function calcLattePrice(params: LattePriceParams): number {
  const { base_price_vnd, gram, powder_price_per_gram, milk_ml, milk_price_per_ml } = params;
  return ceilTo1000(
    base_price_vnd + gram * powder_price_per_gram + milk_ml * milk_price_per_ml
  );
}

// ── Fusion price ──────────────────────────────────────────────────────────────

export interface FusionPriceParams {
  base_price_vnd: number;
  gram: number;
  powder_price_per_gram: number;
  /** Premium_Latte[size] = BaseLatte[selectedPowder][size] − BaseLatte[defaultPowder][size] */
  premium_latte: number;
}

/**
 * Computes final Fusion price.
 * Formula: ceil(base + gram × price_per_gram + premium_latte, 1000)
 */
export function calcFusionPrice(params: FusionPriceParams): number {
  const { base_price_vnd, gram, powder_price_per_gram, premium_latte } = params;
  return ceilTo1000(base_price_vnd + gram * powder_price_per_gram + premium_latte);
}
