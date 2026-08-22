/**
 * Server-side pricing wrapper.
 * Fetches DB data via Prisma → passes plain objects to src/utils/pricing.ts.
 * Zero pricing logic of its own.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveGram,
  calcLattePrice,
  calcFusionPrice,
  calcBaseLiquidDelta,
  resolveBaseLiquidMl,
  type DefaultSizeConfigEntry,
  type PowderSizeConfigEntry,
  type CustomPowderGrams,
  type Size,
} from "@/src/utils/pricing";

/**
 * Minimal interface satisfied by both PrismaClient and the transaction client
 * (Omit<PrismaClient, '$connect' | ...>) that Prisma passes inside $transaction.
 * Only includes the model accessors used by pricing functions.
 */
type PrismaTransactionClient = {
  defaultSizeConfig: typeof prisma.defaultSizeConfig;
  powderSizeConfig: typeof prisma.powderSizeConfig;
  matchaPowder: typeof prisma.matchaPowder;
  milkType: typeof prisma.milkType;
  menuItemSize: typeof prisma.menuItemSize;
  menuItem: typeof prisma.menuItem;
};

// ── Context ───────────────────────────────────────────────────────────────────

export interface PricingContext {
  defaultSizeConfigs: DefaultSizeConfigEntry[];
  /** { [powder_id]: PowderSizeConfigEntry[] } */
  powderSizeConfigMap: Record<string, PowderSizeConfigEntry[]>;
  /** { [powder_id]: number } price_per_gram */
  powderPriceMap: Record<string, number>;
  /** Default milk type price_per_ml */
  defaultMilkPricePerMl: number;
  /** Global Latte default Base Liquid ID. */
  defaultBaseLiquidId?: string | null;
  /** { [milk_type_id]: number } price_per_ml */
  milkPriceMap: Record<string, number>;
  /** List of all currently available powders (used for Fusion fallback logic) */
  availablePowders: { id: string; name: string }[];
  referenceLatteItemMap?: Record<string, string | null>;
  referenceLatteBasePriceMap?: Record<string, Partial<Record<Size, number>>>;
}

/**
 * Builds a pricing context by preloading all required DB data in a single pass.
 * Call once before looping over order items — avoids N+1 queries.
 */
export async function buildPricingContext(
  client: PrismaTransactionClient = prisma,
  include: { powderIds?: string[]; baseLiquidIds?: string[] } = {},
): Promise<PricingContext> {
  const defaultSizeConfigs = await client.defaultSizeConfig.findMany();
  const allPowderConfigs = await client.powderSizeConfig.findMany();
  const allPowders = await client.matchaPowder.findMany({
    where: include.powderIds?.length
      ? { OR: [{ is_available: true }, { id: { in: include.powderIds } }] }
      : { is_available: true },
  });
  const allMilkTypes = await client.milkType.findMany({
    where: include.baseLiquidIds?.length
      ? { OR: [{ is_active: true }, { id: { in: include.baseLiquidIds } }] }
      : { is_active: true },
  });
  const referenceLatteItemIds = [...new Set(allPowders.flatMap((powder) =>
    powder.reference_latte_item_id ? [powder.reference_latte_item_id] : []))];
  const referenceLatteSizes = referenceLatteItemIds.length > 0
    ? await client.menuItemSize.findMany({
        where: { menu_item_id: { in: referenceLatteItemIds } },
        select: { menu_item_id: true, size: true, base_price_vnd: true },
      })
    : [];

  const powderSizeConfigMap: Record<string, PowderSizeConfigEntry[]> = {};
  for (const c of allPowderConfigs) {
    if (!powderSizeConfigMap[c.powder_id]) powderSizeConfigMap[c.powder_id] = [];
    powderSizeConfigMap[c.powder_id].push({
      size: c.size as Size,
      grams: Number(c.grams),
    });
  }

  const powderPriceMap: Record<string, number> = {};
  for (const p of allPowders) {
    powderPriceMap[p.id] = p.price_per_gram;
  }

  const defaultMilk = allMilkTypes.find((m) => m.is_default && m.is_active);
  const milkPriceMap: Record<string, number> = {};
  for (const m of allMilkTypes) {
    milkPriceMap[m.id] = m.price_per_ml;
  }

  const referenceLatteBasePriceMap: Record<string, Partial<Record<Size, number>>> = {};
  for (const row of referenceLatteSizes) {
    if (row.base_price_vnd === null) continue;
    referenceLatteBasePriceMap[row.menu_item_id] ??= {};
    referenceLatteBasePriceMap[row.menu_item_id]![row.size as Size] = row.base_price_vnd;
  }

  return {
    defaultSizeConfigs: defaultSizeConfigs.map((c) => ({
      size: c.size as Size,
      milk_ml: c.milk_ml,
      powder_gram: Number(c.powder_gram),
    })),
    powderSizeConfigMap,
    powderPriceMap,
    defaultMilkPricePerMl: defaultMilk?.price_per_ml ?? 40,
    defaultBaseLiquidId: defaultMilk?.id ?? null,
    milkPriceMap,
    availablePowders: allPowders.filter((p) => p.is_available).map((p) => ({ id: p.id, name: p.name })),
    referenceLatteItemMap: Object.fromEntries(allPowders.map((powder) =>
      [powder.id, powder.reference_latte_item_id])),
    referenceLatteBasePriceMap,
  };
}

export interface BundleBaselineProductInput {
  menu_item_id: string;
  allowed_sizes: Size[];
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
}

export interface ResolvedBundleBaselineProduct extends BundleBaselineProductInput {
  baseline_prices_vnd: Partial<Record<Size, number>>;
  baseline_price_vnd?: number;
}

function premiumLatteFromContext(
  selectedPowderId: string,
  defaultPowderId: string,
  size: Size,
  ctx: PricingContext,
): number {
  const selectedLatteId = ctx.referenceLatteItemMap?.[selectedPowderId];
  const defaultLatteId = ctx.referenceLatteItemMap?.[defaultPowderId];
  if (!selectedLatteId || !defaultLatteId) return 0;
  return (ctx.referenceLatteBasePriceMap?.[selectedLatteId]?.[size] ?? 0) -
    (ctx.referenceLatteBasePriceMap?.[defaultLatteId]?.[size] ?? 0);
}

/** Resolve current checkout prices for immutable BUNDLE configuration snapshots in batches. */
export async function resolveBundleBaselineProducts(
  client: PrismaTransactionClient,
  products: BundleBaselineProductInput[],
): Promise<ResolvedBundleBaselineProduct[]> {
  if (products.length === 0) return [];
  const menus = await client.menuItem.findMany({
    where: { id: { in: [...new Set(products.map((product) => product.menu_item_id))] } },
    include: { sizes: true },
  });
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]));
  const powderIds = products.flatMap((product) => product.default_powder_id ? [product.default_powder_id] : []);
  const baseLiquidIds = products.flatMap((product) => product.default_base_liquid_id ? [product.default_base_liquid_id] : []);
  for (const menu of menus) {
    if (menu.default_powder_id) powderIds.push(menu.default_powder_id);
    if (menu.default_base_liquid_id) baseLiquidIds.push(menu.default_base_liquid_id);
  }
  const ctx = await buildPricingContext(client, { powderIds, baseLiquidIds });
  return products.map((product) => {
    const menu = menuMap.get(product.menu_item_id);
    if (!menu) throw new Error("BUNDLE baseline menu item is missing");
    if (menu.category === "extras") {
      if (menu.unit_price_vnd === null) throw new Error("BUNDLE extras baseline price is missing");
      return { ...product, baseline_prices_vnd: {},
        baseline_price_vnd: resolveOrderItemPrice({ category: "extras", size: null,
          base_price_vnd: menu.unit_price_vnd, custom_powder_grams: null, powder_id: "" }, ctx) };
    }
    if (!product.default_powder_id || !product.default_base_liquid_id) {
      throw new Error("BUNDLE drink baseline configuration is incomplete");
    }
    const baseline_prices_vnd: Partial<Record<Size, number>> = {};
    for (const size of product.allowed_sizes) {
      const sizeRow = menu.sizes.find((row) => row.size === size && row.base_price_vnd !== null);
      if (!sizeRow?.base_price_vnd) throw new Error("BUNDLE baseline size is unavailable");
      const premiumLatte = menu.category === "fusion" && menu.default_powder_id
        ? premiumLatteFromContext(product.default_powder_id, menu.default_powder_id, size, ctx)
        : 0;
      baseline_prices_vnd[size] = resolveOrderItemPrice({
        category: menu.category as "latte" | "fusion",
        size,
        base_price_vnd: sizeRow.base_price_vnd,
        custom_powder_grams: menu.custom_powder_grams as CustomPowderGrams | null,
        powder_id: product.default_powder_id,
        base_liquid_id: product.default_base_liquid_id,
        default_base_liquid_id: menu.category === "latte" ? ctx.defaultBaseLiquidId : menu.default_base_liquid_id,
        base_liquid_ml: sizeRow.base_liquid_ml,
        premium_latte: premiumLatte,
      }, ctx);
    }
    return { ...product, baseline_prices_vnd };
  });
}

// ── Per-item price resolution ─────────────────────────────────────────────────

export interface OrderItemPriceInput {
  category: "latte" | "fusion" | "extras";
  size: Size | null;
  base_price_vnd: number;
  custom_powder_grams: CustomPowderGrams | null;
  /** Resolved powder id (server sets for Latte, client sends for Fusion). */
  powder_id: string;
  /** Latte only — resolved milk type id. */
  milk_type_id?: string | null;
  base_liquid_id?: string | null;
  default_base_liquid_id?: string | null;
  base_liquid_ml?: number | null;
  /**
   * Fusion only — premium_latte must be pre-computed by caller.
   * Use resolveOrderItemPremiumLatte() before calling this function.
   */
  premium_latte?: number;
}

/**
 * Computes the server-authoritative final price for one order item.
 * Uses pre-built PricingContext to avoid DB calls inside a loop.
 */
export function resolveOrderItemPrice(
  input: OrderItemPriceInput,
  ctx: PricingContext
): number {
  if (input.category === "extras") return ceil1000(input.base_price_vnd);
  if (!input.size) throw new Error("Drink size is required");
  const { category, size, base_price_vnd, custom_powder_grams, powder_id } = input;

  const powderSizeConfigs = ctx.powderSizeConfigMap[powder_id] ?? [];
  const gram = resolveGram(size, custom_powder_grams, powderSizeConfigs, ctx.defaultSizeConfigs);
  const powder_price_per_gram = ctx.powderPriceMap[powder_id] ?? 0;
  const systemBaseLiquidMl =
    ctx.defaultSizeConfigs.find((c) => c.size === size)?.milk_ml ?? 0;
  const baseLiquidMl = resolveBaseLiquidMl(input.base_liquid_ml, systemBaseLiquidMl);

  if (category === "latte") {
    const milkTypeId = input.base_liquid_id ?? input.milk_type_id;
    const milk_price_per_ml = milkTypeId
      ? (ctx.milkPriceMap[milkTypeId] ?? ctx.defaultMilkPricePerMl)
      : ctx.defaultMilkPricePerMl;
    return calcLattePrice({
      base_price_vnd,
      gram,
      powder_price_per_gram,
      milk_ml: baseLiquidMl,
      milk_price_per_ml,
    });
  }

  // Fusion
  return calcFusionPrice({
    base_price_vnd,
    gram,
    powder_price_per_gram,
    premium_latte: input.premium_latte ?? 0,
    base_liquid_delta_vnd:
      input.default_base_liquid_id && input.base_liquid_id
        ? calcBaseLiquidDelta(
            baseLiquidMl,
            ctx.milkPriceMap[input.base_liquid_id] ?? 0,
            ctx.milkPriceMap[input.default_base_liquid_id] ?? 0,
          )
        : 0,
  });
}

/** Resolve the effective Base Liquid volume that must be snapshotted on an order item. */
export function resolveOrderItemBaseLiquidMl(
  overrideMl: number | null | undefined,
  size: Size,
  ctx: PricingContext,
): number {
  const systemMl = ctx.defaultSizeConfigs.find((entry) => entry.size === size)?.milk_ml ?? 0;
  return resolveBaseLiquidMl(overrideMl, systemMl);
}

/** Ceil a fixed extras price while keeping all server prices on the VND grid. */
function ceil1000(value: number): number {
  return Math.ceil(value / 1000) * 1000;
}

/**
 * Computes Premium_Latte[size] = BaseField[selectedLatte][size] - BaseField[defaultLatte][size].
 * BaseField here refers to the 'base_price_vnd' column in 'menu_item_sizes' table.
 */
export async function resolveOrderItemPremiumLatte(
  selectedPowderId: string,
  defaultPowderId: string,
  size: Size,
  client: PrismaTransactionClient = prisma
): Promise<number> {
  const selectedPowder = await client.matchaPowder.findUnique({
    where: { id: selectedPowderId },
    select: { reference_latte_item_id: true },
  });
  const defaultPowder = await client.matchaPowder.findUnique({
    where: { id: defaultPowderId },
    select: { reference_latte_item_id: true },
  });

  if (!selectedPowder?.reference_latte_item_id || !defaultPowder?.reference_latte_item_id) {
    return 0;
  }

  const selectedSize = await client.menuItemSize.findFirst({
    where: {
      menu_item_id: selectedPowder.reference_latte_item_id,
      size,
    },
  });
  const defaultSize = await client.menuItemSize.findFirst({
    where: {
      menu_item_id: defaultPowder.reference_latte_item_id,
      size,
    },
  });

  return (selectedSize?.base_price_vnd ?? 0) - (defaultSize?.base_price_vnd ?? 0);
}
