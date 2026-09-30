import type { Size } from "@/contracts/menu";
import type { Prisma } from "@prisma/client";
import {
  resolveOrderItemPremiumLatte,
  resolveOrderItemPrice,
  type PricingContext,
} from "@/lib/pricing";
import { OrderValidationError } from "@/lib/orders/orderProcessingErrors";
import type { OrderItemInput } from "@/lib/orders/orderProcessingTypes";
import {
  productVoucherTargetsConfiguration,
  type ProductVoucherInfo,
} from "@/lib/orders/orderVoucherTargets";

type VoucherMenuItem = Prisma.MenuItemGetPayload<{ include: { sizes: true } }>;
type SizedOrderItem = OrderItemInput & { size: Size };

/** Resolve the PRODUCT or PRODUCT_DISCOUNT credit for one priced drink line. */
export async function resolveProductVoucherDiscount(
  item: SizedOrderItem,
  itemVoucherId: string | undefined,
  productVoucherMap: Map<string, ProductVoucherInfo> | undefined,
  menuItem: VoucherMenuItem,
  server_unit_price: number,
  effectiveFusionDefaultPowderId: string | null,
  powder_id: string,
  resolvedBaseLiquidId: string | null,
  resolvedDefaultBaseLiquidId: string | null,
  client: unknown,
  pricingCtx: PricingContext,
): Promise<number> {
  // 7. Apply PRODUCT voucher credit
  let product_voucher_discount_vnd = 0;
  if (itemVoucherId && productVoucherMap) {
    const pvInfo = productVoucherMap.get(itemVoucherId);
    if (pvInfo) {
      if (pvInfo.voucher_type === "ITEM" || !productVoucherTargetsConfiguration(pvInfo, item.menu_item_id, resolvedBaseLiquidId)) {
        throw new OrderValidationError(
          "VALIDATION_ERROR",
          "Product voucher is not valid for this menu configuration",
        );
      }
      // PRODUCT credit caps at drink price — never spills into addon
      if (pvInfo.voucher_type === "PRODUCT_DISCOUNT") {
        if (!pvInfo.eligible_sizes?.includes(item.size)) {
          throw new OrderValidationError("VALIDATION_ERROR", "Product discount voucher is not valid for this size");
        }
        if (pvInfo.product_discount_mode === "FIXED_AMOUNT") {
          product_voucher_discount_vnd = Math.min(server_unit_price, pvInfo.discount_value ?? 0);
        } else if (pvInfo.product_discount_mode === "PAY_AS_SIZE" && pvInfo.reference_size) {
          const referenceRow = menuItem.sizes.find((row) => row.size === pvInfo.reference_size);
          if (!referenceRow || referenceRow.base_price_vnd === null) {
            throw new OrderValidationError("BUSINESS_RULE_VIOLATION", "Product discount reference size is unavailable");
          }
          const referencePremium = menuItem.category === "fusion" && effectiveFusionDefaultPowderId && powder_id !== effectiveFusionDefaultPowderId
            ? await resolveOrderItemPremiumLatte(powder_id, effectiveFusionDefaultPowderId, pvInfo.reference_size, client as Parameters<typeof resolveOrderItemPremiumLatte>[3], pricingCtx)
            : 0;
          const referencePrice = resolveOrderItemPrice({
            category: menuItem.category as "latte" | "fusion",
            size: pvInfo.reference_size,
            base_price_vnd: referenceRow.base_price_vnd,
            custom_powder_grams: menuItem.custom_powder_grams as Record<string, number> | null,
            powder_id,
            base_liquid_id: resolvedBaseLiquidId,
            default_base_liquid_id: resolvedDefaultBaseLiquidId,
            base_liquid_ml: referenceRow.base_liquid_ml,
            premium_latte: referencePremium,
          }, pricingCtx);
          product_voucher_discount_vnd = Math.max(0, server_unit_price - referencePrice);
        }
      } else {
        product_voucher_discount_vnd = Math.min(server_unit_price, pvInfo.covered_price_vnd);
      }
    }
  }

  return product_voucher_discount_vnd;
}
