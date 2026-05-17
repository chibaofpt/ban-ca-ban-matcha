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
  /** { [milk_type_id]: number } price_per_ml */
  milkPriceMap: Record<string, number>;
}

/**
 * Builds a pricing context by preloading all required DB data in a single pass.
 * Call once before looping over order items — avoids N+1 queries.
 */
export async function buildPricingContext(client: PrismaTransactionClient = prisma): Promise<PricingContext> {
  const defaultSizeConfigs = await client.defaultSizeConfig.findMany();
  const allPowderConfigs = await client.powderSizeConfig.findMany();
  const allPowders = await client.matchaPowder.findMany({ where: { is_available: true } });
  const allMilkTypes = await client.milkType.findMany({ where: { is_active: true } });

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

  const defaultMilk = allMilkTypes.find((m) => m.is_default);
  const milkPriceMap: Record<string, number> = {};
  for (const m of allMilkTypes) {
    milkPriceMap[m.id] = m.price_per_ml;
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
    milkPriceMap,
  };
}

// ── Per-item price resolution ─────────────────────────────────────────────────

export interface OrderItemPriceInput {
  category: "latte" | "fusion";
  size: Size;
  base_price_vnd: number;
  custom_powder_grams: CustomPowderGrams | null;
  /** Resolved powder id (server sets for Latte, client sends for Fusion). */
  powder_id: string;
  /** Latte only — resolved milk type id. */
  milk_type_id?: string | null;
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
  const { category, size, base_price_vnd, custom_powder_grams, powder_id } = input;

  const powderSizeConfigs = ctx.powderSizeConfigMap[powder_id] ?? [];
  const gram = resolveGram(size, custom_powder_grams, powderSizeConfigs, ctx.defaultSizeConfigs);
  const powder_price_per_gram = ctx.powderPriceMap[powder_id] ?? 0;

  if (category === "latte") {
    const milkTypeId = input.milk_type_id;
    const milk_price_per_ml = milkTypeId
      ? (ctx.milkPriceMap[milkTypeId] ?? ctx.defaultMilkPricePerMl)
      : ctx.defaultMilkPricePerMl;
    const milk_ml =
      ctx.defaultSizeConfigs.find((c) => c.size === size)?.milk_ml ?? 0;

    return calcLattePrice({
      base_price_vnd,
      gram,
      powder_price_per_gram,
      milk_ml,
      milk_price_per_ml,
    });
  }

  // Fusion
  return calcFusionPrice({
    base_price_vnd,
    gram,
    powder_price_per_gram,
    premium_latte: input.premium_latte ?? 0,
  });
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
