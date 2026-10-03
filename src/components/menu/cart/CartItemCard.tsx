"use client";

import { memo } from "react";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import type { CalcItemVoucherResult } from "@/src/utils/orderCalculator";
import { SharedCartItemCard } from "@/src/components/shared/SharedCartItemCard";
import { CartItemVoucherButton, CartItemVoucherPriceRow } from "@/src/components/shared/CartItemVoucherPriceRow";

interface CartItemCardProps {
  item: ProjectedCartLine;
  availableVoucherCount: number;
  hideQuantityControls?: boolean;
  editDisabled?: boolean;
  bundleAllocationBadges?: Array<{ token: string; label: string; quantity: number }>;
  voucherDiscounts?: CalcItemVoucherResult;
  menuItem?: MenuItem;
  powderData?: PowderApiResponse;
  milkTypes: MilkTypeOption[];
  allVouchers: MyVoucher[];
  applicableProductVouchers: MyVoucher[];
  applicableAddonVouchers: MyVoucher[];
  walletVerified: boolean;
  voucherReadOnlyReason: string;
  onEdit: (item: ProjectedCartLine) => void;
  onRemove: (cartId: string) => void;
  onUpdateQuantity: (cartId: string, quantity: number) => void;
  onRemoveProductVoucher: (cartId: string) => void;
  onRemoveAddonVoucher: (cartId: string, voucherId: string) => void;
  onOpenVoucherPicker: (cartId: string) => void;
}

/** Adapt customer cart permissions and actions to the shared cart item. */
function CartItemCard(props: CartItemCardProps) {
  const { item, menuItem, powderData, milkTypes, allVouchers, voucherDiscounts, walletVerified,
    voucherReadOnlyReason, availableVoucherCount, onEdit, onRemove, onUpdateQuantity,
    onRemoveProductVoucher, onRemoveAddonVoucher, onOpenVoucherPicker } = props;
  const hasVoucher = Boolean(item.lineVoucher || item.addonVouchers.length > 0);
  const editBlocked = props.editDisabled || (!walletVerified && hasVoucher);
  return <SharedCartItemCard
    item={item} menuItem={menuItem} powders={powderData?.data} milkTypes={milkTypes}
    onEdit={() => onEdit(item)} onRemove={() => onRemove(item.cartId)}
    onDecrease={() => item.quantity <= 1 ? onRemove(item.cartId) : onUpdateQuantity(item.cartId, item.quantity - 1)}
    onIncrease={() => onUpdateQuantity(item.cartId, item.quantity + 1)}
    showQuantity={!hasVoucher && !props.hideQuantityControls} editDisabled={editBlocked}
    bundleAllocationBadges={props.bundleAllocationBadges}
    readOnlyReason={!walletVerified && hasVoucher ? voucherReadOnlyReason : undefined}
    priceRow={<CartItemVoucherPriceRow
      item={item} vouchers={allVouchers} voucherDiscounts={voucherDiscounts}
      onRemoveProduct={onRemoveProductVoucher} onRemoveAddon={onRemoveAddonVoucher}
      removeDisabled={!walletVerified} readOnlyReason={voucherReadOnlyReason}
      showOriginalPrice={item.grossUnitPriceVnd > item.payableUnitVnd} rounding="ceil"
      voucherPicker={availableVoucherCount > 0 ? <CartItemVoucherButton
        count={availableVoucherCount} label="Chọn ưu đãi" disabled={!walletVerified}
        readOnlyReason={voucherReadOnlyReason} onOpen={() => onOpenVoucherPicker(item.cartId)}
      /> : undefined}
    />}
  />;
}

export default memo(CartItemCard);
