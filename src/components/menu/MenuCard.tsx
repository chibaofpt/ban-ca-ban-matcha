"use client";

import React, { useCallback } from 'react';
import Image from 'next/image';
import { Coffee, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem, MilkTypeOption } from '@/src/lib/types/menu';
import { usePowderStore } from '@/src/lib/store/powderStore';
import { useCartStore } from '@/src/lib/store/cartStore';
import { calcLattePrice, calcFusionPrice, resolveGram } from '@/src/utils/pricing';
import { formatKa } from "@/src/utils/display";
import { CartQuantityButton } from "@/src/components/menu/CartQuantityButton";

interface MenuCardProps {
  item: MenuItem;
  milkTypes: MilkTypeOption[];
  /** Total quantity of this menu item across all cart variants. */
  cartQuantity: number;
  /** Number of distinct cart entries (variants) for this item. */
  cartVariantCount: number;
  /** Whether any cart variant for this item has a voucher. */
  cartHasVoucher: boolean;
  /** Click handler for the card body (opens ProductModal or ExistingCartItemSheet). */
  onItemClick: (item: MenuItem) => void;
  priority?: boolean;
}

const SIZE_CARD_LABELS: Record<string, string> = {
  SMALL: "Cá Con",
  MEDIUM: "Cá Vừa",
  LARGE: "Cá Lớn",
};

/** Individual product card displayed on the customer menu page. */
const MenuCard: React.FC<MenuCardProps> = ({
  item,
  milkTypes,
  cartQuantity,
  cartVariantCount,
  cartHasVoucher,
  onItemClick,
  priority,
}) => {
  const sizes = item.sizes.filter((s) => s.base_price_vnd != null);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  const isLatte = item.category === "latte";
  const defaultPowderId = isLatte ? item.powder?.id : item.resolved_default_powder_id;
  const defaultMilk = milkTypes.find((milk) => milk.is_default) ?? milkTypes[0];

  const getDisplayPrice = (sizeObj: MenuItem["sizes"][0]) => {
    const s = sizeObj.size;
    const base = sizeObj.base_price_vnd ?? 0;
    const pwd = powders.find(p => p.id === defaultPowderId);
    const pwdPrice = pwd?.price_per_gram ?? 0;
    const gram = resolveGram(s, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

    if (isLatte) {
      return calcLattePrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        milk_ml: sizeObj.milk_ml ?? 0,
        milk_price_per_ml: defaultMilk?.price_per_ml ?? 40
      });
    } else {
      return calcFusionPrice({
        base_price_vnd: base,
        gram,
        powder_price_per_gram: pwdPrice,
        premium_latte: 0
      });
    }
  };

  const handleIncrement = useCallback(() => {
    const { items, updateQuantity } = useCartStore.getState();
    const cartItem = items.find(ci => ci.menuItemId === item.id);
    if (cartItem) updateQuantity(cartItem.cartId, cartItem.quantity + 1);
  }, [item.id]);

  const handleDecrement = useCallback(() => {
    const { items, updateQuantity } = useCartStore.getState();
    const cartItem = items.find(ci => ci.menuItemId === item.id);
    if (cartItem && cartItem.quantity > 1) updateQuantity(cartItem.cartId, cartItem.quantity - 1);
  }, [item.id]);

  const handleRemove = useCallback(() => {
    const { items, removeItem } = useCartStore.getState();
    const cartItem = items.find(ci => ci.menuItemId === item.id);
    if (cartItem) removeItem(cartItem.cartId);
  }, [item.id]);

  return (
    <motion.div
      onClick={() => onItemClick(item)}
      whileTap={{ scale: 0.96 }}
      className="group flex flex-row items-center justify-between gap-4 md:gap-5 w-full h-[130px] md:h-[150px] border-b border-dashed border-primary/20 last:border-0 transition-all duration-300 cursor-pointer bg-transparent"
    >
      {/* Image Area */}
      <div className="h-[80%] aspect-square bg-[#eef1eb] relative overflow-hidden flex-shrink-0 rounded-2xl">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            quality={75}
            priority={priority}
            placeholder="blur"
            blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Coffee className="h-10 w-10 text-[#b8c9b4] transition-transform duration-300 group-hover:scale-110" />
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-1 h-[80%] justify-between py-1 text-left items-start">
        <div className="w-full">
          <h3 className="font-serif font-medium text-lg text-[#2d4a22] leading-tight line-clamp-2 mb-1">
            {item.name}
            {item.is_seasonal && (
              <span className="inline-flex items-center bg-amber-50 text-amber-600 text-[8px] font-sans font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-amber-200/50 align-middle ml-2 -translate-y-[1px]">
                <Sparkles className="mr-0.5 h-2.5 w-2.5" aria-hidden="true" /> Theo mùa
              </span>
            )}
          </h3>
          {item.description && (
            <p className="text-[11px] text-primary/60 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Sizes & Prices + Cart Button */}
        {/* Fixed 44px slot; the temporary stepper expands left without shifting prices. */}
        <div className="mt-auto pt-2 flex items-end w-full">
          <div className="flex flex-1 justify-between">
            {(['SMALL', 'MEDIUM', 'LARGE'] as const).map((sizeKey) => {
              const s = sizes.find(s => s.size === sizeKey);
              const isDefault = sizeKey === 'MEDIUM';

              if (!s) {
                return <div key={sizeKey}></div>;
              }

              const price = getDisplayPrice(s);
              return (
                <div key={sizeKey} className="flex flex-col items-center gap-0.5">
                  <span className={`uppercase tracking-wide whitespace-nowrap ${isDefault ? 'text-[10px] font-bold text-[#446c35]' : 'text-[9px] font-medium text-primary/40'}`}>
                    {SIZE_CARD_LABELS[sizeKey] ?? sizeKey}
                  </span>
                  <span className={`${isDefault ? 'text-base font-bold text-[#5b9a2b]' : 'text-sm font-semibold text-primary/50'}`}>
                    {formatKa(price, "ceil")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Fixed-width slot so the button area never shifts prices */}
          <div className="flex w-11 shrink-0 justify-end">
            <CartQuantityButton
              quantity={cartQuantity}
              variantCount={cartVariantCount}
              hasVoucher={cartHasVoucher}
              onAdd={() => onItemClick(item)}
              onOpenVariants={() => onItemClick(item)}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              onRemove={handleRemove}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(MenuCard);
