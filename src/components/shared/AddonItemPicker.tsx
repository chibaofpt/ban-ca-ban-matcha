"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useCartStore } from "@/src/lib/store/cartStore";
import type { CartItem } from "@/src/lib/types/cart";
import type { MenuData } from "@/src/lib/types/menu";
import type { MyVoucher } from "@/src/services/customerVoucherService";
import { ceilTo1000 } from "@/src/utils/pricing";

interface AddonItemPickerProps {
  voucher: MyVoucher;
  cartItems: CartItem[];
  menuData: MenuData;
  onBack: () => void;
  onSuccess: () => void;
}

export const AddonItemPicker = ({
  voucher,
  cartItems,
  menuData,
  onBack,
  onSuccess,
}: AddonItemPickerProps) => {
  const { updateItem, applyAddonVoucher, setCartOpen } = useCartStore();

  const handleSelectItem = (item: CartItem) => {
    const addonOptionId = voucher.addon_option_id;
    if (!addonOptionId) return;

    let addonPrice = 0;
    let isExtraMatcha = false;
    // Find price from menuData.addon_groups
    for (const group of menuData.addon_groups) {
      const opt = group.options.find(o => o.id === addonOptionId);
      if (opt) {
        if (opt.gram_value != null && opt.gram_value > 0) {
          isExtraMatcha = true;
        }
        addonPrice = ceilTo1000(opt.price_vnd ?? 0); 
        break;
      }
    }

    if (isExtraMatcha) {
      import("sonner").then(m => m.toast.error("Voucher này không áp dụng cho Extra Matcha"));
      return;
    }

    const alreadyHasAddon = item.selectedOptionIds.includes(addonOptionId);
    if (!alreadyHasAddon) {
      updateItem(item.cartId, {
        selectedOptionIds: [...item.selectedOptionIds, addonOptionId],
        addonPrices: { ...item.addonPrices, [addonOptionId]: addonPrice },
        addonsPrice: item.addonsPrice + addonPrice,
      });
    }

    applyAddonVoucher(item.cartId, voucher.qr_token, addonOptionId);
    setCartOpen(true);
    onSuccess();
  };

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute inset-0 z-20 bg-[#fdfcf7] flex flex-col"
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40 shrink-0 bg-white">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center hover:bg-primary/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h3 className="font-bold text-primary">Chọn món áp dụng</h3>
      </div>
      <div className="flex-1 overflow-y-auto touch-pan-y overflow-x-clip overscroll-x-none p-5 space-y-3 overscroll-contain">
        {cartItems.map(item => (
          <button
            key={item.cartId}
            onClick={() => handleSelectItem(item)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-border/40 rounded-xl text-left hover:border-primary/20 transition-colors"
          >
            <div className="w-12 h-12 shrink-0 rounded-lg overflow-hidden relative bg-secondary/10">
              {item.imageUrl && (
                <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-primary">{item.name}</p>
              <p className="text-xs text-primary/60">Size {item.size} • {(item.clientPriceVnd / 1000).toLocaleString("vi-VN")}K</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
};
