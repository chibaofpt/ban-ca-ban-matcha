"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import MenuCard from "@/src/components/menu/MenuCard";
import { useCartStore } from "@/src/lib/store/cartStore";
import { usePowderStore } from "@/src/lib/store/powderStore";
import {
  computeVoucherItemPrice,
  computeProductDiscountBenefit,
  resolveVoucherBaseLiquidId,
} from "@/src/hooks/useAddVoucherToCart";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData, Size } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import ProductModal from "@/src/components/shared/ProductModal";
import { SizeLabel } from "@/src/components/ui/SizeLabel";
import {
  getEligibleProductDiscountItems,
  type EligibleProductDiscountItem,
} from "@/src/utils/customerVoucherSelection";

interface ProductDiscountItemPickerProps {
  voucher: MyVoucher;
  menuData: MenuData;
  /** Lock voucher edits while the wallet query is loading or revalidating. */
  canEdit?: boolean;
  onSuccess: () => void;
}

/**
 * ProductDiscountItemPicker — luồng "Dùng ngay" cho PRODUCT_DISCOUNT / PAY_AS_SIZE.
 *
 * Bước 1: Hiển thị danh sách món đủ điều kiện (không size).
 * Bước 2: Bấm chọn → mở ProductModal với allowedSizes lọc theo eligible_sizes voucher.
 * Bước 3: Customer customize → confirm → addItem + applyProductVoucher + mở giỏ.
 */
export const ProductDiscountItemPicker = ({
  voucher,
  menuData,
  canEdit = true,
  onSuccess,
}: ProductDiscountItemPickerProps) => {
  const addItem = useCartStore((state) => state.addItem);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGram = usePowderStore((s) => s.defaultPowderGram);

  const [pickedItem, setPickedItem] = useState<EligibleProductDiscountItem | null>(null);
  const eligibleItems = getEligibleProductDiscountItems(
    [...menuData.latte, ...menuData.fusion],
    voucher.eligible_menu_items,
    voucher.menu_item_id,
    voucher.eligible_sizes as Size[] | undefined,
  );
  const voucherSizes = (voucher.eligible_sizes ?? []) as Size[];

  /** Called when ProductModal's onConfirm fires with the fully configured CartItem. */
  const handleConfirm = (cartItem: CartItem) => {
      if (!canEdit) return;
      const configuration = cartItem.configuration;
      if (configuration.size === null) {
        toast.error("Vui lòng chọn size hợp lệ.");
        return;
      }

      const target = eligibleItems.find(
        ({ item }) => item.id === cartItem.menuItemId,
      );
      if (!target || !target.allowedSizes.includes(configuration.size)) {
        toast.error("Món hoặc size này không thuộc phạm vi voucher.");
        return;
      }
      const menuItem = target.item;

      const resolvedBaseLiquidId = resolveVoucherBaseLiquidId(
        menuItem,
        configuration.baseLiquidId ?? null,
        menuData.base_liquids ?? menuData.milk_types,
      );

      const { drinkPrice } = computeVoucherItemPrice(
        menuItem,
        configuration.size,
        configuration.powderId ?? null,
        resolvedBaseLiquidId,
        [], // PRODUCT_DISCOUNT benefit excludes addons
        powders,
        defaultPowderGram,
        menuData.latte,
        menuData.milk_types,
        menuData.addon_groups,
      );

      const referenceSize = voucher.product_discount_mode === "PAY_AS_SIZE"
        ? voucher.reference_size
        : null;
      if (
        voucher.product_discount_mode === "PAY_AS_SIZE" &&
        (!referenceSize || !menuItem.sizes.some((row) => row.size === referenceSize))
      ) {
        toast.error("Món này không còn size tham chiếu của voucher.");
        return;
      }

      const referenceDrinkPrice =
        referenceSize
          ? computeVoucherItemPrice(
              menuItem,
              referenceSize,
              configuration.powderId ?? null,
              resolvedBaseLiquidId,
              [],
              powders,
              defaultPowderGram,
              menuData.latte,
              menuData.milk_types,
              menuData.addon_groups,
            ).drinkPrice
          : null;

      const benefit = computeProductDiscountBenefit(voucher, drinkPrice, referenceDrinkPrice);
      if (benefit <= 0) {
        toast.error("Voucher không tạo ra giá trị giảm cho cấu hình này.");
        return;
      }

      // Destructure cartId (assigned by ProductModal) — addItem generates its own
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cartId: _cartId, ...cartItemWithoutId } = cartItem;
      const result = addItem({
        ...cartItemWithoutId,
        quantity: 1,
        lineVoucher: { token: voucher.qr_token, kind: "PRODUCT_DISCOUNT" },
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      queueMicrotask(onSuccess);
  };

  // When an item is picked, open ProductModal for customization
  if (pickedItem) {
    return (
      <ProductModal
        item={pickedItem.item}
        latteItems={menuData.latte}
        milkTypes={menuData.milk_types}
        addonGroups={menuData.addon_groups}
        allowedSizes={pickedItem.allowedSizes}
        disableVoucherApplication
        nested
        ctaLabel="Thêm vào giỏ"
        onClose={() => setPickedItem(null)}
        onConfirm={handleConfirm}
      />
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="product-discount-targets">
        <div>
          <h5 id="product-discount-targets" className="text-xs font-bold uppercase tracking-widest text-primary/50">Chọn món áp dụng</h5>
          {voucherSizes.length > 0 && (
            <p className="mt-1 text-xs text-primary/60">
              Size được giảm: {voucherSizes.map((size, index) => (
                <React.Fragment key={size}>
                  {index > 0 ? " / " : null}<SizeLabel size={size} />
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
        {eligibleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-semibold text-primary/50">
              Không có món nào phù hợp với voucher này.
            </p>
          </div>
        ) : (
          eligibleItems.map(({ item, allowedSizes }) => (
            <div key={item.id} className={!canEdit ? "opacity-50" : undefined}>
              <MenuCard
                item={item}
                milkTypes={menuData.milk_types}
                compact
                disabled={!canEdit}
                allowedSizes={allowedSizes}
                onItemClick={() => setPickedItem({ item, allowedSizes })}
              />
            </div>
          ))
        )}
    </section>
  );
};
