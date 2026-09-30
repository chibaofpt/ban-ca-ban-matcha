import type { Prisma, PrismaClient } from "@prisma/client";
import type { PricingContext } from "@/lib/pricing";
import { OrderValidationError } from "@/lib/orders/orderProcessingErrors";
import type { OrderItemInput, ProcessedAddon } from "@/lib/orders/orderProcessingTypes";

type AddonDatabase = Pick<PrismaClient, "addonOption">;
type OrderAddonOption = Prisma.AddonOptionGetPayload<{
  include: { group: { select: { id: true; is_active: true; max_select: true; is_dynamic_gram: true } } };
}>;

/** Prefetched addon options available to one order-item resolution. */
export type OrderAddonCatalog = ReadonlyMap<string, OrderAddonOption>;

/** Resolve addon snapshots and ADDON voucher discounts for one drink line. */
export async function resolveOrderAddons(
  item: OrderItemInput,
  client: AddonDatabase,
  pricingCtx: PricingContext,
  powder_id: string,
  addonVoucherMap?: Map<string, string>,
  catalog?: { addonOptions: OrderAddonCatalog },
): Promise<{
  original_addons_price_vnd: number;
  resolvedAddons: ProcessedAddon[];
  total_addon_discount: number;
}> {
  // 5. Resolve addon prices — snapshot at order time
  let original_addons_price_vnd = 0;
  const resolvedAddons: ProcessedAddon[] = [];
  const selectedAddonOptionIds = new Set<string>();
  const selectedAddonGroupCounts = new Map<string, number>();

  for (const optionId of item.addon_option_ids) {
    if (selectedAddonOptionIds.has(optionId)) {
      throw new OrderValidationError("VALIDATION_ERROR", "Addon option bị trùng trong cùng một món.");
    }
    selectedAddonOptionIds.add(optionId);

    const option = catalog
      ? catalog.addonOptions.get(optionId)
      : await (client as PrismaClient).addonOption.findUnique({
          where: { id: optionId },
          include: {
            group: { select: { id: true, is_active: true, max_select: true, is_dynamic_gram: true } },
          },
        });
    if (!option || !option.is_active || !option.group.is_active) {
      throw new OrderValidationError(
        "NOT_FOUND",
        `Addon option not found or inactive: ${optionId}`
      );
    }

    const groupCount = selectedAddonGroupCounts.get(option.group.id) ?? 0;
    if (groupCount >= option.group.max_select) {
      throw new OrderValidationError(
        "VALIDATION_ERROR",
        `Nhóm addon chỉ cho phép chọn tối đa ${option.group.max_select} option.`,
      );
    }
    selectedAddonGroupCounts.set(option.group.id, groupCount + 1);

    let addonUnitPrice: number;
    if (option.gram_value !== null && Number(option.gram_value) > 0) {
      const pricePerGram = pricingCtx.powderPriceMap[powder_id] ?? 0;
      const rawCost = Number(option.gram_value) * pricePerGram;
      addonUnitPrice = Math.ceil(rawCost / 1000) * 1000;
    } else {
      addonUnitPrice = option.price_vnd;
    }

    original_addons_price_vnd += addonUnitPrice;
    resolvedAddons.push({
      addon_option_id: option.id,
      quantity: 1,
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

  return { original_addons_price_vnd, resolvedAddons, total_addon_discount };
}
