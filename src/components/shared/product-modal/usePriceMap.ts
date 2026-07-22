import { useMemo } from "react";
import type { AddonGroup, MenuItem, MilkTypeOption, Size } from "@/src/lib/types/menu";
import type { Powder, DefaultPowderGram } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import {
  applyProductVoucherCredit,
  calcLattePrice,
  calcFusionPrice,
  resolveGram,
  ceilTo1000,
} from "@/src/utils/pricing";

interface UsePriceMapProps {
  item: MenuItem;
  milkTypes: MilkTypeOption[];
  addonGroups: AddonGroup[];
  latteItems: MenuItem[];
  powders: Powder[];
  defaultPowderGrams: DefaultPowderGram[];
  selectedSize: Size;
  activePowderId: string;
  selectedMilkId: string;
  quantityMap: Record<string, number>;
  selectedOptionIds: string[];
  selectedAddonVoucherIds: string[];
  availableVouchers?: MyVoucher[];
  selectedProductVoucherId: string | null;
  freeVoucherId?: string;
  freeVoucherCoveredPriceVnd?: number;
  quantity: number;
}

export function usePriceMap({
  item,
  milkTypes,
  addonGroups,
  latteItems,
  powders,
  defaultPowderGrams,
  selectedSize,
  activePowderId,
  selectedMilkId,
  quantityMap,
  selectedOptionIds,
  selectedAddonVoucherIds,
  availableVouchers,
  selectedProductVoucherId,
  freeVoucherId,
  freeVoucherCoveredPriceVnd,
  quantity
}: UsePriceMapProps) {
  const isLatte = item.category === "latte";

  // Memoize the getPrice function since it might be called on every render if not careful.
  // Actually, we can just calculate the current active context pricing directly.
  return useMemo(() => {
    const getPriceForContext = (targetSize: Size, targetPowderId: string, milkId?: string) => {
      const sizeObj = item.sizes.find((s) => s.size === targetSize);
      const base_price_vnd = sizeObj?.base_price_vnd ?? 0;
      const pwd = powders.find((p) => p.id === targetPowderId);
      const pwd_price_per_gram = pwd?.price_per_gram ?? 0;
      const gram = resolveGram(targetSize, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

      let baseDrinkPrice = 0;
      if (isLatte) {
        const milk_ml = sizeObj?.milk_ml ?? 0;
        const milk = milkTypes.find((candidate) => candidate.id === (milkId ?? selectedMilkId));
        const milk_price_per_ml = milk?.price_per_ml ?? 40;
        baseDrinkPrice = calcLattePrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, milk_ml, milk_price_per_ml });
      } else {
        let premium_latte = 0;
        const defaultPowder = powders.find((p) => p.id === item.resolved_default_powder_id);
        if (pwd?.reference_latte_item_id && defaultPowder?.reference_latte_item_id) {
          const selBase = latteItems.find((i) => i.id === pwd.reference_latte_item_id)?.sizes.find((s) => s.size === targetSize)?.base_price_vnd ?? 0;
          const defBase = latteItems.find((i) => i.id === defaultPowder.reference_latte_item_id)?.sizes.find((s) => s.size === targetSize)?.base_price_vnd ?? 0;
          premium_latte = selBase - defBase;
        }
        baseDrinkPrice = calcFusionPrice({ base_price_vnd, gram, powder_price_per_gram: pwd_price_per_gram, premium_latte });
      }

      let addonsCost = 0;
      const addonPricesMap: Record<string, number> = {};

      for (const g of addonGroups) {
        if (g.type === "QUANTITY") {
          const qty = quantityMap[g.id] ?? 0;
          const opt = g.options[0];
          if (qty > 0 && opt) {
            const rawCost = qty * (opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd);
            const lineCost = ceilTo1000(rawCost);
            addonsCost += lineCost;
            addonPricesMap[opt.id] = ceilTo1000(opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd);
          }
        } else {
          for (const opt of g.options) {
            if (selectedOptionIds.includes(opt.id)) {
              const rawCost = opt.gram_value != null ? opt.gram_value * pwd_price_per_gram : opt.price_vnd;
              const lineCost = ceilTo1000(rawCost);
              addonsCost += lineCost;
              addonPricesMap[opt.id] = lineCost;
            }
          }
        }
      }
      return { baseDrinkPrice, addonsCost, unitPrice: baseDrinkPrice + addonsCost, addonPricesMap };
    };

    const currentPriceContext = getPriceForContext(selectedSize, activePowderId);
    
    let finalUnitPrice = currentPriceContext.unitPrice;
    let finalAddonsCost = currentPriceContext.addonsCost;

    // 1. Apply Addon Vouchers deduction
    for (const vid of selectedAddonVoucherIds) {
      const v = availableVouchers?.find(av => av.id === vid);
      if (v && v.addon_option_id) {
        const addonPrice = currentPriceContext.addonPricesMap[v.addon_option_id] ?? 0;
        finalAddonsCost = Math.max(0, finalAddonsCost - addonPrice);
        finalUnitPrice = Math.max(0, finalUnitPrice - addonPrice);
      }
    }

    // 2. Apply Product Voucher deduction
    const activeProductVoucher = availableVouchers?.find(v => v.id === selectedProductVoucherId);
    const effectiveFreeVoucherId = freeVoucherId || selectedProductVoucherId;
    const effectiveFreeCoveredPrice = freeVoucherCoveredPriceVnd ?? activeProductVoucher?.covered_price_vnd ?? undefined;

    if (effectiveFreeVoucherId && effectiveFreeCoveredPrice !== undefined) {
      const baseDrinkPrice = finalUnitPrice - finalAddonsCost;
      const priceAfterProductVoucher = applyProductVoucherCredit(
        baseDrinkPrice,
        finalAddonsCost,
        effectiveFreeCoveredPrice
      );
      finalUnitPrice = priceAfterProductVoucher.totalVnd;
      finalAddonsCost = priceAfterProductVoucher.addonsPayableVnd;
    }

    const totalCost = finalUnitPrice * quantity;

    return {
      getPriceForContext,
      currentPriceContext,
      finalUnitPrice,
      finalAddonsCost,
      totalCost,
      effectiveFreeVoucherId,
      effectiveFreeCoveredPrice
    };
  }, [
    item, latteItems, milkTypes, addonGroups, powders, defaultPowderGrams, selectedSize, activePowderId,
    selectedMilkId, quantityMap, selectedOptionIds, selectedAddonVoucherIds,
    availableVouchers, selectedProductVoucherId, freeVoucherId, freeVoucherCoveredPriceVnd, quantity, isLatte
  ]);
}
