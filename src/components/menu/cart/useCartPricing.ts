import { useMemo } from "react";
import type { CartItem } from "@/src/lib/types/cart";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { filterUsableVouchers, buildAddonVoucherMap, buildProductVoucherMap, estimateMultiDiscountSavings } from "@/src/utils/voucherMatchUtils";

interface UseCartPricingProps {
  items: CartItem[];
  allVouchers: MyVoucher[];
  selectedVoucherIds: string[];
  subtotalPrice: number;
  orderType: "PICKUP" | "DELIVERY";
  shippingFee: number | null;
}

export const useCartPricing = ({
  items,
  allVouchers,
  selectedVoucherIds,
  subtotalPrice,
  orderType,
  shippingFee
}: UseCartPricingProps) => {
  return useMemo(() => {
    // Derived voucher lists
    const discountVouchers = filterUsableVouchers(allVouchers, "DISCOUNT");
    const freeshipVouchers = filterUsableVouchers(allVouchers, "FREESHIP");
    const applicableAddonVouchersMap = buildAddonVoucherMap(allVouchers, items);
    const applicableProductVouchers = buildProductVoucherMap(allVouchers, items);

    // Calculate final display price using multi-voucher estimator
    const selectedDiscountVouchers = discountVouchers.filter(v => selectedVoucherIds.includes(v.id));
    const rawDiscountAmount = estimateMultiDiscountSavings(selectedDiscountVouchers, subtotalPrice);
    
    // Apply rounding rules to avoid .5k decimals in UI
    const subtotalK = Math.ceil(subtotalPrice / 1000);
    const discountK = Math.floor(rawDiscountAmount / 1000); // Conservative discount display
    const finalK = Math.max(0, subtotalK - discountK);
    
    const shippingK = orderType === "DELIVERY" && shippingFee !== null ? Math.floor(shippingFee / 1000) : 0;
    
    let freeshipDiscountK = 0;
    let appliedFreeshipId: string | null = null;
    
    const selectedFreeshipVouchers = freeshipVouchers.filter(v => selectedVoucherIds.includes(v.id));
    if (orderType === "DELIVERY" && shippingFee !== null && selectedFreeshipVouchers.length > 0) {
      const bestVoucher = selectedFreeshipVouchers[0];
      freeshipDiscountK = Math.floor(Math.min(shippingFee, bestVoucher.covered_delivery_fee_vnd ?? 0) / 1000);
      appliedFreeshipId = bestVoucher.id;
    }

    const totalDiscountK = discountK + freeshipDiscountK;
    const grandTotalK = Math.max(0, finalK + shippingK - freeshipDiscountK);
    
    const discountAmount = discountK * 1000;
    const finalPrice = grandTotalK * 1000;

    return {
      discountVouchers,
      freeshipVouchers,
      applicableAddonVouchersMap,
      applicableProductVouchers,
      subtotalK,
      discountK,
      shippingK,
      freeshipDiscountK,
      appliedFreeshipId,
      totalDiscountK,
      grandTotalK,
      discountAmount,
      finalPrice,
      selectedDiscountVouchers,
      selectedFreeshipVouchers
    };
  }, [items, allVouchers, selectedVoucherIds, subtotalPrice, orderType, shippingFee]);
};
