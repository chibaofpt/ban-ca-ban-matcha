/**
 * Shared order processing logic for both customer and staff order creation.
 * Validates items, re-fetches and compares prices, resolves addons.
 * All writes must be called within a prisma.$transaction().
 */

import { buildPricingContext } from "@/lib/pricing";
import {
  resolveOrderItem,
  type OrderItemDatabase,
  type OrderResolverCatalog,
} from "@/lib/orders/orderItemResolver";
import { PriceChangedError } from "@/lib/orders/orderProcessingErrors";
import type {
  OrderItemInput,
  PriceConflict,
  ProcessedOrderItem,
} from "@/lib/orders/orderProcessingTypes";
import type { ProductVoucherInfo } from "@/lib/orders/orderVoucherTargets";

/** Structural type satisfied by both PrismaClient and the Prisma transaction client. */
type DbClient = OrderItemDatabase;
type OrderCatalog = OrderResolverCatalog;

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
  const supportsBatchCatalog =
    typeof (client.menuItem as { findMany?: unknown }).findMany === "function" &&
    typeof (client.addonOption as { findMany?: unknown }).findMany === "function";
  const menuIds = [...new Set(items.map((item) => item.menu_item_id))];
  const addonIds = [...new Set(items.flatMap((item) => item.addon_option_ids))];
  const menuItems = supportsBatchCatalog
    ? await client.menuItem.findMany({
        where: { id: { in: menuIds } },
        include: {
          sizes: true,
          fusionAllowedPowders: { include: { matchaPowder: { select: { is_available: true } } } },
          allowedBaseLiquids: { include: { baseLiquid: { select: { is_active: true } } } },
        },
      })
    : [];
  const originalPowderIds = [...new Set(menuItems.flatMap((menu) => menu.default_powder_id ? [menu.default_powder_id] : []))];
  const [pricingCtx, addonOptions] = await Promise.all([
    buildPricingContext(client as Parameters<typeof buildPricingContext>[0], { powderIds: originalPowderIds }),
    supportsBatchCatalog && addonIds.length > 0
      ? client.addonOption.findMany({
          where: { id: { in: addonIds } },
          include: { group: { select: { id: true, is_active: true, max_select: true, is_dynamic_gram: true } } },
        })
      : Promise.resolve([]),
  ]);
  const catalog: OrderCatalog | undefined = supportsBatchCatalog
    ? {
        menuItems: new Map(menuItems.map((item) => [item.id, item])),
        addonOptions: new Map(addonOptions.map((option) => [option.id, option])),
      }
    : undefined;

  const priceConflicts: PriceConflict[] = [];

  const resolved: ProcessedOrderItem[] = [];
  for (const item of items) {
    const res = await resolveOrderItem(item, client, pricingCtx, priceConflicts, productVoucherMap, addonVoucherMap, catalog);
    resolved.push(res);
  }

  if (priceConflicts.length > 0) {
    throw new PriceChangedError(priceConflicts);
  }

  return resolved;
}
