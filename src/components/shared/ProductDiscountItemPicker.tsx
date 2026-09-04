"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Leaf, Sparkles } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
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
import {
  getEligibleProductDiscountItems,
  type EligibleProductDiscountItem,
} from "@/src/utils/customerVoucherSelection";

interface ProductDiscountItemPickerProps {
  voucher: MyVoucher;
  menuData: MenuData;
  onBack: () => void;
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
  onBack,
  onSuccess,
}: ProductDiscountItemPickerProps) => {
  const { addItem, applyProductVoucher, setCartOpen } = useCartStore();
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

  const sizeLabel = (s: Size) => (s === "SMALL" ? "Nhỏ" : s === "MEDIUM" ? "Vừa" : "Lớn");

  /** Called when ProductModal's onConfirm fires with the fully configured CartItem. */
  const handleConfirm = (cartItem: CartItem) => {
      if (!cartItem.size) {
        toast.error("Vui lòng chọn size hợp lệ.");
        return;
      }

      const target = eligibleItems.find(
        ({ item }) => item.id === cartItem.menuItemId,
      );
      if (!target || !target.allowedSizes.includes(cartItem.size)) {
        toast.error("Món hoặc size này không thuộc phạm vi voucher.");
        return;
      }
      const menuItem = target.item;

      const resolvedBaseLiquidId = resolveVoucherBaseLiquidId(
        menuItem,
        cartItem.selectedBaseLiquidId ?? cartItem.selectedMilkTypeId ?? null,
        menuData.base_liquids ?? menuData.milk_types,
      );

      const { drinkPrice } = computeVoucherItemPrice(
        menuItem,
        cartItem.size,
        cartItem.selectedPowderId ?? null,
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
              cartItem.selectedPowderId ?? null,
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
      const newCartId = addItem({
        ...cartItemWithoutId,
        // Clear any voucher fields ProductModal may have set; we apply ours below
        productVoucherId: undefined,
        productVoucherDiscountVnd: undefined,
        productVoucherType: undefined,
      });

      if (!newCartId) {
        toast.error("Không thể thêm món vào giỏ. Vui lòng thử lại.");
        return;
      }

      applyProductVoucher(newCartId, voucher.qr_token, benefit, "PRODUCT_DISCOUNT");

      setCartOpen(true);
      onSuccess();
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
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-20 flex flex-col bg-background"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-card">
        <button
          type="button"
          onClick={onBack}
          aria-label="Quay lại chi tiết voucher"
          className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <div>
          <h3 className="font-bold text-primary">Chọn món áp dụng</h3>
          {voucherSizes.length > 0 && (
            <p className="text-xs text-primary/50">
              Size được giảm: {voucherSizes.map(sizeLabel).join(" / ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3 overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {eligibleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-semibold text-primary/50">
              Không có món nào phù hợp với voucher này.
            </p>
          </div>
        ) : (
          eligibleItems.map(({ item, allowedSizes }) => (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => setPickedItem({ item, allowedSizes })}
              className="w-full flex items-center gap-4 p-3.5 bg-card border border-border/40 rounded-2xl text-left hover:border-primary/30 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden relative bg-primary/5">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : (
                  <Leaf className="absolute inset-0 m-auto size-6 text-primary/50" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-primary truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-primary/55 mt-0.5 line-clamp-1">{item.description}</p>
                )}
                <p className="text-xs text-primary/40 mt-1">
                  <span className="inline-flex items-center gap-1">
                    {item.category === "latte" ? <Leaf className="size-3" /> : <Sparkles className="size-3" />}
                    {item.category === "latte" ? "Latte Premium" : "Fusion Special"}
                  </span>
                </p>
              </div>
              <ArrowLeft className="w-4 h-4 text-primary/30 rotate-180 shrink-0" aria-hidden="true" />
            </motion.button>
          ))
        )}
      </div>
    </motion.div>
  );
};
