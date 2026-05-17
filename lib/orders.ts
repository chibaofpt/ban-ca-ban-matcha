/**
 * Shared order processing logic for both customer and staff order creation.
 * Validates items, re-fetches and compares prices, resolves addons.
 * All writes must be called within a prisma.$transaction().
 */

import { Decimal } from "@prisma/client/runtime/library";
import {
  buildPricingContext,
  resolveOrderItemPrice,
  resolveOrderItemPremiumLatte,
  type PricingContext,
} from "@/lib/pricing";
import type { Size, SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import { prisma } from "@/lib/prisma";

/** Prisma transaction client type — compatible with prisma.$transaction callback argument. */
type PrismaTxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];



// ── Input/Output types ────────────────────────────────────────────────────────

export interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  size: Size;
  sweetness: SweetnessLevel;
  ice_option?: IceOption;
  coldwhisk?: boolean;
  note?: string;
  addon_option_ids: { option_id: string; quantity: number }[];
  product_voucher_id?: string;
  selected_powder_id?: string;
  selected_milk_type_id?: string;
  client_price_vnd: number;
}

export interface ProcessedAddon {
  addon_option_id: string;
  quantity: number;
  /** Snapshot price at order time. Extra matcha: gram_value × price_per_gram. Others: price_vnd. */
  unit_price_vnd: number;
}

export interface ProcessedOrderItem {
  menu_item_id: string;
  quantity: number;
  size: Size;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  product_voucher_id: string | null;
  selected_powder_id: string;
  selected_milk_type_id: string | null;
  /** Snapshot unit price at order time. 0 if product_voucher_id is set. */
  unit_price_vnd: number;
  /** Total addon cost for this line item. */
  addons_price_vnd: number;
  /** line_total = (unit_price_vnd + addons_price_vnd) × quantity */
  line_total: number;
  resolvedAddons: ProcessedAddon[];
}

export interface PriceConflict {
  menu_item_id: string;
  name: string;
  size: Size;
  client_price_vnd: number;
  server_price_vnd: number;
}

// ── Error sentinel ────────────────────────────────────────────────────────────

export class OrderValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export class PriceChangedError extends Error {
  constructor(public readonly conflicts: PriceConflict[]) {
    super("One or more item prices have changed.");
    this.name = "PriceChangedError";
  }
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Validates all order items, re-fetches prices from DB, compares against client prices,
 * and resolves addon costs. Call inside prisma.$transaction().
 *
 * Throws OrderValidationError for invalid items/sizes/powders.
 * Throws PriceChangedError if any client_price_vnd does not match server price.
 */
export async function processOrderItems(
  items: OrderItemInput[],
  tx: PrismaTxClient
): Promise<ProcessedOrderItem[]> {
  // Build pricing context once — avoids N+1 across the item loop
  const pricingCtx = await buildPricingContext(tx);

  const priceConflicts: PriceConflict[] = [];

  const resolved = await Promise.all(
    items.map((item) => resolveOneItem(item, tx, pricingCtx, priceConflicts))
  );

  if (priceConflicts.length > 0) {
    throw new PriceChangedError(priceConflicts);
  }

  return resolved;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Resolves a single order item: fetches menu data, validates, computes price, resolves addons. */
async function resolveOneItem(
  item: OrderItemInput,
  tx: PrismaTxClient,
  pricingCtx: PricingContext,
  priceConflicts: PriceConflict[]
): Promise<ProcessedOrderItem> {
  // 1. Fetch menu item — must be available
  const menuItem = await tx.menuItem.findUnique({
    where: { id: item.menu_item_id },
    include: { sizes: true, fusionAllowedPowders: true },
  });

  if (!menuItem || !menuItem.is_available) {
    throw new OrderValidationError(
      "NOT_FOUND",
      `Menu item not found or unavailable: ${item.menu_item_id}`
    );
  }

  // 2. Validate size is sold (base_price_vnd must not be null)
  const sizeRow = menuItem.sizes.find((s) => s.size === item.size);
  if (!sizeRow || sizeRow.base_price_vnd === null) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      `Size ${item.size} is not available for item: ${menuItem.name}`
    );
  }

  // 3. Resolve powder_id and premium_latte
  let powder_id: string;
  let premium_latte = 0;

  if (menuItem.category === "latte") {
    // Latte: server always uses the item's fixed powder — ignore client-sent value
    if (!menuItem.matcha_powder_id) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        `Latte item is missing matcha_powder_id: ${menuItem.name}`
      );
    }
    powder_id = menuItem.matcha_powder_id;
  } else {
    // Fusion: validate selected_powder_id against allowed list + default
    const resolvedDefault = menuItem.default_powder_id ?? "";
    const allowedIds = (menuItem.fusionAllowedPowders ?? []).map((p) => p.powder_id);
    const sentPowderId = item.selected_powder_id ?? resolvedDefault;

    const isDefaultPowder = sentPowderId === resolvedDefault;
    const isInAllowedList = allowedIds.includes(sentPowderId);

    if (!isDefaultPowder && !isInAllowedList) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        `Powder ${sentPowderId} is not allowed for fusion item: ${menuItem.name}`
      );
    }

    powder_id = sentPowderId || resolvedDefault;

    // Compute Premium_Latte if a non-default powder was selected
    if (powder_id && resolvedDefault && powder_id !== resolvedDefault) {
      premium_latte = await resolveOrderItemPremiumLatte(
        powder_id,
        resolvedDefault,
        item.size,
        tx
      );
    }
  }

  // 4. Compute server-authoritative unit price
  const server_unit_price = resolveOrderItemPrice(
    {
      category: menuItem.category as "latte" | "fusion",
      size: item.size,
      base_price_vnd: sizeRow.base_price_vnd,
      custom_powder_grams: menuItem.custom_powder_grams as Record<string, number> | null,
      powder_id,
      milk_type_id: menuItem.category === "latte" ? (item.selected_milk_type_id ?? null) : null,
      premium_latte,
    },
    pricingCtx
  );

  // PRODUCT voucher → unit_price_vnd = 0 (addons still charged at full price)
  const final_unit_price = item.product_voucher_id ? 0 : server_unit_price;

  // 5. Resolve addon prices — snapshot at order time
  let addons_price_vnd = 0;
  const resolvedAddons: ProcessedAddon[] = [];

  for (const addon of item.addon_option_ids) {
    const option = await tx.addonOption.findUnique({
      where: { id: addon.option_id },
    });
    if (!option) {
      throw new OrderValidationError(
        "NOT_FOUND",
        `Addon option not found: ${addon.option_id}`
      );
    }

    // Extra matcha: price = ceil(gram_value × selected_powder.price_per_gram, 1000)
    // All other addons: price = price_vnd directly
    let addonUnitPrice: number;
    if (option.gram_value !== null && Number(option.gram_value) > 0) {
      const pricePerGram = pricingCtx.powderPriceMap[powder_id] ?? 0;
      const rawCost = Number(option.gram_value) * pricePerGram;
      addonUnitPrice = Math.ceil(rawCost / 1000) * 1000;
    } else {
      addonUnitPrice = option.price_vnd;
    }

    const addonLineCost = addonUnitPrice * addon.quantity;
    addons_price_vnd += addonLineCost;
    resolvedAddons.push({
      addon_option_id: option.id,
      quantity: addon.quantity,
      unit_price_vnd: addonUnitPrice,
    });
  }

  // 6. PRICE_CHANGED check
  const full_server_unit_price = final_unit_price + addons_price_vnd;
  if (item.client_price_vnd !== full_server_unit_price) {
    priceConflicts.push({
      menu_item_id: item.menu_item_id,
      name: menuItem.name,
      size: item.size,
      client_price_vnd: item.client_price_vnd,
      server_price_vnd: full_server_unit_price,
    });
  }

  const line_total = full_server_unit_price * item.quantity;

  return {
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    size: item.size,
    sweetness: item.sweetness,
    ice_option: item.ice_option ?? "NORMAL",
    coldwhisk: item.coldwhisk ?? false,
    note: item.note ?? null,
    product_voucher_id: item.product_voucher_id ?? null,
    selected_powder_id: powder_id,
    selected_milk_type_id: item.selected_milk_type_id ?? null,
    unit_price_vnd: final_unit_price,
    addons_price_vnd,
    line_total,
    resolvedAddons,
  };
}
