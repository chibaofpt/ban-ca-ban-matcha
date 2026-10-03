"use client";

import { memo } from "react";
import type { ProjectedCartLine } from "@/src/lib/types/cart";
import type { MenuItem, MilkTypeOption } from "@/src/lib/types/menu";
import type { PowderApiResponse } from "@/src/lib/types/powder";
import type { MyVoucher } from "@/src/services/staffVoucherService";
import type { CalcItemVoucherResult } from "@/src/utils/orderCalculator";
import { SharedCartItemCard } from "@/src/components/shared/SharedCartItemCard";
import { AdminMobileCartItemCard } from "./AdminMobileCartItemCard";

export interface StaffCartItemCardProps {
  layoutVariant?: "admin-mobile" | "staff";
  voucherDiscounts?: CalcItemVoucherResult;
  item: ProjectedCartLine;
  availableVoucherCount: number;
  voucherMutationDisabled?: boolean;
  menuItem?: MenuItem;
  powderData?: PowderApiResponse;
  milkTypes: MilkTypeOption[];
  customerVouchers: MyVoucher[];
  applicableProductVouchers: MyVoucher[];
  applicableAddonVouchers: MyVoucher[];
  onEdit: (item: ProjectedCartLine) => void;
  onRemove: (cartId: string) => void;
  onChangeQuantity: (cartId: string, quantity: number) => void;
  onRemoveProduct?: (cartId: string) => void;
  onRemoveAddon?: (cartId: string, voucherId: string) => void;
  onOpenVoucherPicker: (cartId: string) => void;
  bundleAllocationBadges?: Array<{ token: string; label: string; quantity: number }>;
}

/** Adapt counter cart permissions and actions to the shared cart item. */
function StaffCartItemCard(props: StaffCartItemCardProps) {
  const { item, menuItem, powderData, milkTypes, onEdit, onRemove, onChangeQuantity, bundleAllocationBadges = [] } = props;
  return <SharedCartItemCard
    item={item} menuItem={menuItem} powders={powderData?.data} milkTypes={milkTypes}
    onEdit={() => onEdit(item)} onRemove={() => onRemove(item.cartId)}
    onDecrease={() => onChangeQuantity(item.cartId, item.quantity - 1)}
    onIncrease={() => onChangeQuantity(item.cartId, item.quantity + 1)}
    quantityDisabled={Boolean(item.lineVoucher) || item.revalidating || bundleAllocationBadges.length > 0}
    decreaseDisabled={item.quantity <= 1} bundleAllocationBadges={bundleAllocationBadges}
    priceRow={<AdminMobileCartItemCard {...props} />}
  />;
}

export default memo(StaffCartItemCard);
