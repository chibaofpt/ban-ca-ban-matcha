"use client";


import { CartItemVoucherButton, CartItemVoucherPriceRow } from "@/src/components/shared/CartItemVoucherPriceRow";
import type { StaffCartItemCardProps } from "./StaffCartItemCard";


/** Render the voucher selection and price row for the shared counter cart item. */
export function AdminMobileCartItemCard({
  item, voucherDiscounts, customerVouchers, availableVoucherCount, voucherMutationDisabled, onRemoveProduct,
  onRemoveAddon, onOpenVoucherPicker,
}: StaffCartItemCardProps) {

  return (
    <CartItemVoucherPriceRow
      item={item}
      vouchers={customerVouchers}
      voucherDiscounts={voucherDiscounts}
      onRemoveProduct={onRemoveProduct}
      onRemoveAddon={onRemoveAddon}
      removeDisabled={item.revalidating || voucherMutationDisabled}
      showOriginalPrice={Boolean(item.lineVoucher && item.grossUnitPriceVnd !== item.payableUnitVnd)}
      voucherPicker={availableVoucherCount > 0 ? (
        <CartItemVoucherButton
          count={availableVoucherCount}
          label="Chọn ưu đãi"
          disabled={item.revalidating || voucherMutationDisabled}
          onOpen={() => onOpenVoucherPicker(item.cartId)}
        />
      ) : undefined}
    />
  );
}
