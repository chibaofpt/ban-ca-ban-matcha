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

import type { PrismaClient } from "@prisma/client";

/** Structural type satisfied by both PrismaClient and the Prisma transaction client. */
type DbClient = Pick<
  PrismaClient,
  | "menuItem"
  | "addonOption"
  | "defaultSizeConfig"
  | "powderSizeConfig"
  | "matchaPowder"
  | "milkType"
  | "menuItemSize"
>;

/** Validated PRODUCT voucher data for a single order item — pre-fetched outside the transaction. */
export interface ProductVoucherInfo {
  /** The menu_item_id the voucher is locked to. Server rejects if item doesn't match. */
  menu_item_id: string;
  /** The total covered amount (drink + configured addons). Acts as a credit against the item total. */
  covered_price_vnd: number;
}



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
  addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
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
  addon_voucher_ids: { voucher_id: string; addon_option_id: string }[];
  addon_discount_vnd: number;
  selected_powder_id: string;
  selected_milk_type_id: string | null;
  /** Amount customer actually pays for the drink (after voucher credit). 0 if fully covered. */
  unit_price_vnd: number;
  /** Total addon cost for this line item (not affected by voucher credit). */
  addons_price_vnd: number;
  /** Server-computed drink price BEFORE any voucher credit. Used for surplus calculation. */
  original_unit_price_vnd: number;
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
 * @param productVoucherMap - Pre-validated PRODUCT voucher data keyed by voucher ID.
 *   Must be fetched and validated (ownership, status, expiry) BEFORE calling this function.
 *   If provided, items with matching product_voucher_id will have their unit_price_vnd
 *   reduced by the covered amount (customer pays the surplus, if any).
 *
 * Throws OrderValidationError for invalid items/sizes/powders.
 * Throws PriceChangedError if any client_price_vnd does not match server price.
 */
export async function processOrderItems(
  items: OrderItemInput[],
  client: DbClient,
  productVoucherMap?: Map<string, ProductVoucherInfo>,
  addonVoucherMap?: Map<string, string>
): Promise<ProcessedOrderItem[]> {
  // Build pricing context once — avoids N+1 across the item loop
  const pricingCtx = await buildPricingContext(client as Parameters<typeof buildPricingContext>[0]);

  const priceConflicts: PriceConflict[] = [];

  const resolved: ProcessedOrderItem[] = [];
  for (const item of items) {
    const res = await resolveOneItem(item, client, pricingCtx, priceConflicts, productVoucherMap, addonVoucherMap);
    resolved.push(res);
  }

  if (priceConflicts.length > 0) {
    throw new PriceChangedError(priceConflicts);
  }

  return resolved;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Resolves a single order item: fetches menu data, validates, computes price, resolves addons. */
async function resolveOneItem(
  item: OrderItemInput,
  client: DbClient,
  pricingCtx: PricingContext,
  priceConflicts: PriceConflict[],
  productVoucherMap?: Map<string, ProductVoucherInfo>,
  addonVoucherMap?: Map<string, string>
): Promise<ProcessedOrderItem> {
  // 1. Fetch menu item — must be available
  if ((item.product_voucher_id || (item.addon_voucher_ids && item.addon_voucher_ids.length > 0)) && item.quantity > 1) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      "Voucher chỉ có thể áp dụng cho 1 sản phẩm. Vui lòng tách sản phẩm ra trước khi áp dụng."
    );
  }

  const menuItem = await (client as PrismaClient).menuItem.findUnique({
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
        client as Parameters<typeof resolveOrderItemPremiumLatte>[3]
      );
    }
  }

  // 4. Compute server-authoritative drink price
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

  // Apply PRODUCT voucher credit: covered_price_vnd acts as a credit against (drink + addons).
  // We first subtract from the drink price; any remaining credit reduces the addons paid.
  // The final unit_price_vnd is what the customer actually pays for the drink portion.
  // Surplus (when covered > actual total) is computed after addons are resolved below.
  let voucher_credit = 0;
  if (item.product_voucher_id && productVoucherMap) {
    const pvInfo = productVoucherMap.get(item.product_voucher_id);
    if (pvInfo) {
      if (pvInfo.menu_item_id !== item.menu_item_id) {
        throw new OrderValidationError(
          "VALIDATION_ERROR",
          `Product voucher is not valid for this menu item`
        );
      }
      voucher_credit = pvInfo.covered_price_vnd;
    }
  }

  // Drink portion after credit (never below 0)
  const drink_after_credit = Math.max(0, server_unit_price - voucher_credit);
  // Remaining credit that can spill over to addons
  const remaining_credit = Math.max(0, voucher_credit - server_unit_price);

  // 5. Resolve addon prices — snapshot at order time
  let addons_price_vnd = 0;
  const resolvedAddons: ProcessedAddon[] = [];

  for (const addon of item.addon_option_ids) {
    const option = await (client as PrismaClient).addonOption.findUnique({
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

  // Apply any remaining voucher credit to addons
  const addons_after_credit = Math.max(0, addons_price_vnd - remaining_credit);

  // Apply ADDON voucher discounts
  let addon_discount_vnd = 0;
  if (item.addon_voucher_ids && addonVoucherMap) {
    const discountedAddons = new Set<string>();
    for (const av of item.addon_voucher_ids) {
      const targetAddonOptionId = addonVoucherMap.get(av.voucher_id);
      if (targetAddonOptionId && !discountedAddons.has(targetAddonOptionId)) {
        const matchingAddon = resolvedAddons.find(
          (a) => a.addon_option_id === targetAddonOptionId
        );
        if (matchingAddon) {
          addon_discount_vnd += matchingAddon.unit_price_vnd;
          discountedAddons.add(targetAddonOptionId);
        }
      }
    }
  }

  const final_addons_price_after_addon_voucher = Math.max(0, addons_after_credit - addon_discount_vnd);

  const final_unit_price = drink_after_credit;
  const final_addons_price = final_addons_price_after_addon_voucher;

  // 6. PRICE_CHANGED check
  // Client sends total per item = what they expect to pay (after voucher).
  const full_server_unit_price = final_unit_price + final_addons_price;
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
    addon_voucher_ids: item.addon_voucher_ids || [],
    selected_powder_id: powder_id,
    selected_milk_type_id: item.selected_milk_type_id ?? null,
    unit_price_vnd: final_unit_price,
    addon_discount_vnd,
    addons_price_vnd: final_addons_price,
    original_unit_price_vnd: server_unit_price,
    line_total,
    resolvedAddons,
  };
}
