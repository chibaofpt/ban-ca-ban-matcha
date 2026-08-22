/**
 * Shared order processing logic for both customer and staff order creation.
 * Validates items, re-fetches and compares prices, resolves addons.
 * All writes must be called within a prisma.$transaction().
 */

import {
  buildPricingContext,
  resolveOrderItemPrice,
  resolveOrderItemBaseLiquidMl,
  resolveOrderItemPremiumLatte,
  type PricingContext,
} from "@/lib/pricing";
import type { Size, SweetnessLevel } from "@/src/lib/types/menu";
import type { IceOption } from "@/src/lib/types/cart";
import type { PrismaClient } from "@prisma/client";
import {
  resolveDefaultBaseLiquidId,
  resolveFusionDefaultPowderId,
} from "@/src/utils/menuConfiguration";

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
  /** Fixed PRODUCT credit, capped at the server-computed drink price and never applied to addons. */
  covered_price_vnd: number;
  voucher_type?: "PRODUCT" | "ITEM";
}



// ── Input/Output types ────────────────────────────────────────────────────────

export interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  size?: Size | null;
  sweetness: SweetnessLevel;
  ice_option?: IceOption;
  coldwhisk?: boolean;
  note?: string;
  addon_option_ids: { option_id: string; quantity: number }[];
  product_voucher_id?: string;
  item_voucher_id?: string;
  addon_voucher_ids?: { voucher_id: string; addon_option_id: string }[];
  selected_powder_id?: string;
  selected_milk_type_id?: string;
  selected_base_liquid_id?: string;
  client_price_vnd: number;
}

export interface ProcessedAddon {
  addon_option_id: string;
  quantity: number;
  /** Snapshot original price at order time. Extra matcha: gram_value × price_per_gram. Others: price_vnd. */
  unit_price_vnd: number;
  /** Present only for Extra Matcha options; ADDON vouchers cannot cover these options. */
  gram_value: number | null;
  /** Exact amount of discount applied by an addon voucher (0 if none) */
  discount_applied_vnd: number;
}

export interface ProcessedOrderItem {
  menu_item_id: string;
  quantity: number;
  size: Size | null;
  sweetness: SweetnessLevel;
  ice_option: IceOption;
  coldwhisk: boolean;
  note: string | null;
  product_voucher_id: string | null;
  item_voucher_id: string | null;
  addon_voucher_ids: { voucher_id: string; addon_option_id: string }[];
  selected_powder_id: string | null;
  selected_milk_type_id: string | null;
  /** Immutable effective Base Liquid volume for historical consumption reports. */
  base_liquid_ml: number | null;
  /** Server-computed drink price BEFORE any voucher credit. (Original price) */
  unit_price_vnd: number;
  /** Server-computed addons price BEFORE any voucher credit. (Original price) */
  addons_price_vnd: number;
  /** Exact amount of discount applied by the product voucher */
  product_voucher_discount_vnd: number;
  /** Total discount for this line item (product_voucher_discount_vnd + sum of addon voucher discounts) */
  total_discount_vnd: number;
  /** line_total = (unit_price_vnd + addons_price_vnd) × quantity (Original line total before discounts) */
  line_total: number;
  resolvedAddons: ProcessedAddon[];
}

export interface PriceConflict {
  menu_item_id: string;
  name: string;
  size: Size | null;
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
  if ((item.product_voucher_id || item.item_voucher_id || (item.addon_voucher_ids && item.addon_voucher_ids.length > 0)) && item.quantity > 1) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      "Voucher chỉ có thể áp dụng cho 1 sản phẩm. Vui lòng tách sản phẩm ra trước khi áp dụng."
    );
  }

  const menuItem = await (client as PrismaClient).menuItem.findUnique({
    where: { id: item.menu_item_id },
    include: { 
      sizes: true, 
      fusionAllowedPowders: {
        include: { matchaPowder: { select: { is_available: true } } }
      },
      allowedBaseLiquids: {
        include: { baseLiquid: { select: { is_active: true } } },
      },
    },
  });

  if (!menuItem || !menuItem.is_available) {
    throw new OrderValidationError(
      "NOT_FOUND",
      `Menu item not found or unavailable: ${item.menu_item_id}`
    );
  }

  const itemVoucherId = item.item_voucher_id ?? item.product_voucher_id;
  if (menuItem.category === "extras") {
    if (item.size != null || item.selected_powder_id || item.selected_milk_type_id || item.selected_base_liquid_id || item.addon_option_ids.length > 0) {
      throw new OrderValidationError("VALIDATION_ERROR", "Món Add-on chỉ hỗ trợ số lượng và ghi chú.");
    }
    if (menuItem.unit_price_vnd === null || menuItem.unit_price_vnd < 1000 || menuItem.unit_price_vnd % 1000 !== 0) {
      throw new OrderValidationError("BUSINESS_RULE_VIOLATION", `Giá món Add-on không hợp lệ: ${menuItem.name}`);
    }
    const serverUnitPrice = menuItem.unit_price_vnd;
    const itemVoucher = itemVoucherId ? productVoucherMap?.get(itemVoucherId) : undefined;
    if (itemVoucher && (itemVoucher.voucher_type !== "ITEM" || itemVoucher.menu_item_id !== item.menu_item_id)) {
      throw new OrderValidationError("VALIDATION_ERROR", "ITEM voucher không áp dụng cho món Add-on này.");
    }
    const itemDiscount = itemVoucher ? serverUnitPrice : 0;
    const expectedClientPrice = serverUnitPrice - itemDiscount;
    if (item.client_price_vnd !== expectedClientPrice) {
      priceConflicts.push({
        menu_item_id: item.menu_item_id,
        name: menuItem.name,
        size: null,
        client_price_vnd: item.client_price_vnd,
        server_price_vnd: expectedClientPrice,
      });
    }
    return {
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      size: null,
      sweetness: item.sweetness ?? "FULL",
      ice_option: item.ice_option ?? "NORMAL",
      coldwhisk: item.coldwhisk ?? false,
      note: item.note ?? null,
      product_voucher_id: item.product_voucher_id ?? null,
      item_voucher_id: item.item_voucher_id ?? item.product_voucher_id ?? null,
      addon_voucher_ids: [],
      selected_powder_id: null,
      selected_milk_type_id: null,
      base_liquid_ml: null,
      unit_price_vnd: serverUnitPrice,
      addons_price_vnd: 0,
      product_voucher_discount_vnd: itemDiscount,
      total_discount_vnd: itemDiscount,
      line_total: serverUnitPrice * item.quantity,
      resolvedAddons: [],
    };
  }

  // 2. Validate size is sold (base_price_vnd must not be null)
  if (!item.size) {
    throw new OrderValidationError("VALIDATION_ERROR", `Size là bắt buộc cho đồ uống: ${menuItem.name}`);
  }
  if (item.item_voucher_id) {
    throw new OrderValidationError("VALIDATION_ERROR", "ITEM voucher chỉ áp dụng cho món Add-on.");
  }
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
    if (!pricingCtx.availablePowders.some((powder) => powder.id === menuItem.matcha_powder_id)) {
      throw new OrderValidationError("BUSINESS_RULE_VIOLATION", `Bột cố định của Latte đã ngưng bán: ${menuItem.name}`);
    }
    powder_id = menuItem.matcha_powder_id;
  } else {
    const resolvedDefault = resolveFusionDefaultPowderId(
      menuItem.default_powder_id,
      pricingCtx.availablePowders.map((powder) => ({
        ...powder,
        price_per_gram: pricingCtx.powderPriceMap[powder.id] ?? Number.MAX_SAFE_INTEGER,
        is_available: true,
      })),
    );
    if (!resolvedDefault) {
      throw new OrderValidationError("BUSINESS_RULE_VIOLATION", `Fusion không còn bột active: ${menuItem.name}`);
    }

    const allowedIds = (menuItem.fusionAllowedPowders ?? [])
      .filter((p) => p.matchaPowder?.is_available)
      .map((p) => p.powder_id);
      
    const sentPowderId = item.selected_powder_id ?? resolvedDefault;

    const isDefaultPowder = sentPowderId === resolvedDefault;
    const isInAllowedList = allowedIds.includes(sentPowderId);

    if (!isDefaultPowder && !isInAllowedList) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        `Powder ${sentPowderId} is not allowed or unavailable for fusion item: ${menuItem.name}`
      );
    }

    powder_id = sentPowderId;

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

  // 4. Resolve Base Liquid for both categories. The physical snapshot column
  // keeps its legacy name for backward-compatible deployments.
  if (
    item.selected_base_liquid_id &&
    item.selected_milk_type_id &&
    item.selected_base_liquid_id !== item.selected_milk_type_id
  ) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      "selected_base_liquid_id conflicts with selected_milk_type_id",
    );
  }
  const requestedBaseLiquidId =
    item.selected_base_liquid_id ?? item.selected_milk_type_id ?? null;
  const configuredDefaultBaseLiquidId = menuItem.category === "latte"
    ? pricingCtx.defaultBaseLiquidId ?? null
    : menuItem.default_base_liquid_id;
  const allowedBaseLiquidIds = (menuItem.allowedBaseLiquids ?? [])
    .filter((entry) => entry.baseLiquid.is_active)
    .map((entry) => entry.base_liquid_id);
  const compatibleBaseLiquidIds = [
    ...(configuredDefaultBaseLiquidId ? [configuredDefaultBaseLiquidId] : []),
    ...allowedBaseLiquidIds,
  ];
  const legacyFusionWithoutBaseLiquid = menuItem.category === "fusion"
    && !configuredDefaultBaseLiquidId
    && allowedBaseLiquidIds.length === 0;
  if (legacyFusionWithoutBaseLiquid && requestedBaseLiquidId) {
    throw new OrderValidationError("VALIDATION_ERROR", `Fusion legacy không hỗ trợ đổi Base Liquid: ${menuItem.name}`);
  }
  const resolvedDefaultBaseLiquidId = resolveDefaultBaseLiquidId(
    configuredDefaultBaseLiquidId,
    compatibleBaseLiquidIds,
    pricingCtx.availableBaseLiquids ?? Object.keys(pricingCtx.milkPriceMap)
      .sort((left, right) => left.localeCompare(right))
      .map((id, display_order) => ({ id, is_active: true, display_order })),
  );
  if (!resolvedDefaultBaseLiquidId && !legacyFusionWithoutBaseLiquid) {
    throw new OrderValidationError("BUSINESS_RULE_VIOLATION", `Món không còn Base Liquid phù hợp: ${menuItem.name}`);
  }
  const resolvedBaseLiquidId = legacyFusionWithoutBaseLiquid
    ? null
    : requestedBaseLiquidId ?? resolvedDefaultBaseLiquidId;
  const isAllowed = resolvedBaseLiquidId === resolvedDefaultBaseLiquidId
    || (resolvedBaseLiquidId !== null && allowedBaseLiquidIds.includes(resolvedBaseLiquidId));
  if (!legacyFusionWithoutBaseLiquid && (!resolvedBaseLiquidId || !isAllowed || pricingCtx.milkPriceMap[resolvedBaseLiquidId] === undefined)) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      `Base Liquid không được phép hoặc đã ngưng bán: ${menuItem.name}`,
    );
  }

  // 5. Compute server-authoritative drink price
  const server_unit_price = resolveOrderItemPrice(
    {
      category: menuItem.category as "latte" | "fusion",
      size: item.size,
      base_price_vnd: sizeRow.base_price_vnd,
      custom_powder_grams: menuItem.custom_powder_grams as Record<string, number> | null,
      powder_id,
      base_liquid_id: resolvedBaseLiquidId,
      default_base_liquid_id: resolvedDefaultBaseLiquidId,
      base_liquid_ml: sizeRow.base_liquid_ml,
      premium_latte,
    },
    pricingCtx
  );
  const baseLiquidMl = resolveOrderItemBaseLiquidMl(
    sizeRow.base_liquid_ml,
    item.size,
    pricingCtx,
  );

  // 5. Resolve addon prices — snapshot at order time
  let original_addons_price_vnd = 0;
  const resolvedAddons: ProcessedAddon[] = [];
  const selectedAddonOptionIds = new Set<string>();
  const selectedAddonGroupIds = new Set<string>();

  for (const addon of item.addon_option_ids) {
    if (selectedAddonOptionIds.has(addon.option_id)) {
      throw new OrderValidationError("VALIDATION_ERROR", "Addon option bị trùng trong cùng một món.");
    }
    selectedAddonOptionIds.add(addon.option_id);

    const option = await (client as PrismaClient).addonOption.findUnique({
      where: { id: addon.option_id },
      include: {
        group: {
          include: {
            options: {
              where: { is_active: true },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!option || !option.is_active || !option.group.is_active) {
      throw new OrderValidationError(
        "NOT_FOUND",
        `Addon option not found or inactive: ${addon.option_id}`
      );
    }

    if (selectedAddonGroupIds.has(option.group.id)) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        "Mỗi nhóm addon chỉ được chọn một option.",
      );
    }
    selectedAddonGroupIds.add(option.group.id);

    if (option.group.type === "SELECTOR" || option.group.type === "TOGGLE") {
      if (addon.quantity !== 1) {
        throw new OrderValidationError(
          "VALIDATION_ERROR",
          `${option.group.type} chỉ chấp nhận quantity = 1.`,
        );
      }
    } else {
      const maxQuantity = option.group.max_quantity;
      if (maxQuantity == null || addon.quantity > maxQuantity) {
        throw new OrderValidationError(
          "VALIDATION_ERROR",
          "Số lượng addon vượt quá giới hạn của nhóm.",
        );
      }
    }

    if (
      (option.group.type === "TOGGLE" || option.group.type === "QUANTITY") &&
      (option.group.options.length !== 1 || option.group.options[0]?.id !== option.id)
    ) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        `Cấu hình ${option.group.type} không hợp lệ.`,
      );
    }

    let addonUnitPrice: number;
    if (option.gram_value !== null && Number(option.gram_value) > 0) {
      const pricePerGram = pricingCtx.powderPriceMap[powder_id] ?? 0;
      const rawCost = Number(option.gram_value) * pricePerGram;
      addonUnitPrice = Math.ceil(rawCost / 1000) * 1000;
    } else {
      addonUnitPrice = option.price_vnd;
    }

    const addonLineCost = addonUnitPrice * addon.quantity;
    original_addons_price_vnd += addonLineCost;
    resolvedAddons.push({
      addon_option_id: option.id,
      quantity: addon.quantity,
      unit_price_vnd: addonUnitPrice,
      gram_value: option.gram_value ? Number(option.gram_value) : null,
      discount_applied_vnd: 0,
    });
  }

  // 6. Apply ADDON voucher discounts FIRST
  let total_addon_discount = 0;
  if (item.addon_voucher_ids && addonVoucherMap) {
    const discountedAddons = new Set<string>();
    for (const av of item.addon_voucher_ids) {
      const targetAddonOptionId = addonVoucherMap.get(av.voucher_id);
      if (targetAddonOptionId && !discountedAddons.has(targetAddonOptionId)) {
        const matchingAddon = resolvedAddons.find(
          (a) => a.addon_option_id === targetAddonOptionId
        );
        if (matchingAddon) {
          if (matchingAddon.gram_value !== null && matchingAddon.gram_value > 0) {
            throw new OrderValidationError(
              "VALIDATION_ERROR",
              "Voucher ADDON không áp dụng cho Extra Matcha."
            );
          }
          matchingAddon.discount_applied_vnd = matchingAddon.unit_price_vnd; // Fully discounts 1 qty
          total_addon_discount += matchingAddon.discount_applied_vnd;
          discountedAddons.add(targetAddonOptionId);
        }
      }
    }
  }

  // 7. Apply PRODUCT voucher credit
  let product_voucher_discount_vnd = 0;
  if (itemVoucherId && productVoucherMap) {
    const pvInfo = productVoucherMap.get(itemVoucherId);
    if (pvInfo) {
      if (pvInfo.voucher_type === "ITEM" || pvInfo.menu_item_id !== item.menu_item_id) {
        throw new OrderValidationError(
          "VALIDATION_ERROR",
          `Product voucher is not valid for this menu item`
        );
      }
      // PRODUCT credit caps at drink price — never spills into addon
      product_voucher_discount_vnd = Math.min(server_unit_price, pvInfo.covered_price_vnd);
    }
  }

  const total_discount_vnd = product_voucher_discount_vnd + total_addon_discount;

  // 8. PRICE_CHANGED check
  // expectedClientPrice is the net price the customer should pay for a single unit
  const expectedClientPrice = (server_unit_price + original_addons_price_vnd) - total_discount_vnd;

  if (item.client_price_vnd !== expectedClientPrice) {
    priceConflicts.push({
      menu_item_id: item.menu_item_id,
      name: menuItem.name,
      size: item.size,
      client_price_vnd: item.client_price_vnd,
      server_price_vnd: expectedClientPrice,
    });
  }

  // line_total is the original line total (before discounts)
  const line_total = (server_unit_price + original_addons_price_vnd) * item.quantity;

  return {
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    size: item.size,
    sweetness: item.sweetness,
    ice_option: item.ice_option ?? "NORMAL",
    coldwhisk: item.coldwhisk ?? false,
    note: item.note ?? null,
    product_voucher_id: item.product_voucher_id ?? null,
    item_voucher_id: item.item_voucher_id ?? null,
    addon_voucher_ids: item.addon_voucher_ids || [],
    selected_powder_id: powder_id,
    selected_milk_type_id: resolvedBaseLiquidId,
    base_liquid_ml: baseLiquidMl,
    unit_price_vnd: server_unit_price,
    addons_price_vnd: original_addons_price_vnd,
    product_voucher_discount_vnd,
    total_discount_vnd,
    line_total,
    resolvedAddons,
  };
}
