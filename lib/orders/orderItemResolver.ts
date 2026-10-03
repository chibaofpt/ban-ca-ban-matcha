import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveOrderItemPrice, resolveOrderItemBaseLiquidMl, resolveOrderItemPremiumLatte, type PricingContext } from "@/lib/pricing";
import { resolveOrderAddons, type OrderAddonCatalog } from "@/lib/orders/orderAddonResolver";
import { resolveExtrasOrderItem } from "@/lib/orders/orderExtrasResolver";
import { OrderValidationError } from "@/lib/orders/orderProcessingErrors";
import type { OrderItemInput, PriceConflict, ProcessedOrderItem } from "@/lib/orders/orderProcessingTypes";
import { resolveProductVoucherDiscount } from "@/lib/orders/orderProductVoucherDiscount";
import type { ProductVoucherInfo } from "@/lib/orders/orderVoucherTargets";
import { resolveDefaultBaseLiquidId, resolveFusionDefaultPowderId } from "@/src/utils/menuConfiguration";

/** Structural database surface used while resolving one order item. */
export type OrderItemDatabase = Pick<PrismaClient, "menuItem" | "addonOption" | "defaultSizeConfig" | "powderSizeConfig" | "matchaPowder" | "milkType" | "menuItemSize">;

/** Menu row shape prefetched for one order-item resolution. */
export type OrderResolverMenuItem = Prisma.MenuItemGetPayload<{
  include: {
    sizes: true;
    fusionAllowedPowders: { include: { matchaPowder: { select: { is_available: true } } } };
    allowedBaseLiquids: { include: { baseLiquid: { select: { is_active: true } } } };
  };
}>;

/** Prefetched menu and addon catalogs shared across one order batch. */
export interface OrderResolverCatalog {
  menuItems: ReadonlyMap<string, OrderResolverMenuItem>;
  addonOptions: OrderAddonCatalog;
}

/** Resolve and validate one order item against authoritative catalog and pricing data. */
export async function resolveOrderItem(
  item: OrderItemInput,
  client: OrderItemDatabase,
  pricingCtx: PricingContext,
  priceConflicts: PriceConflict[],
  productVoucherMap?: Map<string, ProductVoucherInfo>,
  addonVoucherMap?: Map<string, string>,
  catalog?: OrderResolverCatalog,
): Promise<ProcessedOrderItem> {
  // 1. Fetch menu item — must be available
  if ((item.product_voucher_id || item.item_voucher_id || (item.addon_voucher_ids && item.addon_voucher_ids.length > 0)) && item.quantity > 1) {
    throw new OrderValidationError(
      "VALIDATION_ERROR",
      "Voucher chỉ có thể áp dụng cho 1 sản phẩm. Vui lòng tách sản phẩm ra trước khi áp dụng."
    );
  }

  const menuItem = catalog
    ? catalog.menuItems.get(item.menu_item_id)
    : await (client as PrismaClient).menuItem.findUnique({
        where: { id: item.menu_item_id },
        include: {
          sizes: true,
          fusionAllowedPowders: { include: { matchaPowder: { select: { is_available: true } } } },
          allowedBaseLiquids: { include: { baseLiquid: { select: { is_active: true } } } },
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
    return resolveExtrasOrderItem(
      item,
      menuItem,
      itemVoucherId,
      productVoucherMap,
      priceConflicts,
    );
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
  let effectiveFusionDefaultPowderId: string | null = null;

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
    effectiveFusionDefaultPowderId = resolvedDefault;
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
        client as Parameters<typeof resolveOrderItemPremiumLatte>[3],
        pricingCtx,
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

  const { original_addons_price_vnd, resolvedAddons, total_addon_discount } =
    await resolveOrderAddons(
      item,
      client,
      pricingCtx,
      powder_id,
      addonVoucherMap,
      catalog,
    );

  const product_voucher_discount_vnd = await resolveProductVoucherDiscount(
    item as Parameters<typeof resolveProductVoucherDiscount>[0],
    itemVoucherId,
    productVoucherMap,
    menuItem,
    server_unit_price,
    effectiveFusionDefaultPowderId,
    powder_id,
    resolvedBaseLiquidId,
    resolvedDefaultBaseLiquidId,
    client,
    pricingCtx,
  );

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
    product_voucher_type: item.product_voucher_id
      ? (productVoucherMap?.get(item.product_voucher_id)?.voucher_type === "PRODUCT_DISCOUNT" ? "PRODUCT_DISCOUNT" : "PRODUCT")
      : null,
    total_discount_vnd,
    line_total,
    resolvedAddons,
  };
}
