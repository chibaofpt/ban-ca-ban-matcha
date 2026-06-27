"use client";

import React from 'react';
import { Coffee, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem } from '@/src/lib/types/menu';
import { usePowderStore } from '@/src/lib/store/powderStore';
import { useCartStore } from '@/src/lib/store/cartStore';
import { calcLattePrice, calcFusionPrice, resolveGram } from '@/src/utils/pricing';

interface MenuCardProps {
  item: MenuItem;
  onClick: (item: MenuItem) => void;
}

const SIZE_CARD_LABELS: Record<string, string> = {
  M: "Cá Con",
  L: "Cá Vừa",
  XL: "Cá Lớn",
};

const MenuCard: React.FC<MenuCardProps> = ({ item, onClick }) => {
  const sizes = item.sizes.filter((s) => s.base_price_vnd != null);
  const powders = usePowderStore((s) => s.data);
  const defaultPowderGrams = usePowderStore((s) => s.defaultPowderGram);

  const isLatte = item.category === "latte";
  const defaultPowderId = isLatte ? item.powder?.id : item.resolved_default_powder_id;
  const defaultMilk = item.milk_types?.find(m => m.is_default) ?? item.milk_types?.[0];

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

  const addItem = useCartStore((s) => s.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const sizeObj = sizes.find(s => s.size === 'L') ?? sizes[0];
    if (!sizeObj) return;
    
    const size = sizeObj.size;
    const basePrice = sizeObj.base_price_vnd ?? 0;
    
    const pwd = powders.find(p => p.id === defaultPowderId);
    const pwdPrice = pwd?.price_per_gram ?? 0;
    const gram = resolveGram(size, item.custom_powder_grams, pwd?.size_config ?? [], defaultPowderGrams);

    let unitPrice = 0;
    let addonsCost = 0;
    
    if (isLatte) {
      unitPrice = calcLattePrice({
        base_price_vnd: basePrice,
        gram,
        powder_price_per_gram: pwdPrice,
        milk_ml: sizeObj.milk_ml ?? 0,
        milk_price_per_ml: defaultMilk?.price_per_ml ?? 40
      });
    } else {
      unitPrice = calcFusionPrice({
        base_price_vnd: basePrice,
        gram,
        powder_price_per_gram: pwdPrice,
        premium_latte: 0
      });
    }
    
    const defaultOptionIds = item.addon_groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id));
    const addonPricesMap: Record<string, number> = {};
    item.addon_groups.forEach(g => {
        g.options.forEach(opt => {
            if (defaultOptionIds.includes(opt.id)) {
                const price = opt.gram_value != null ? opt.gram_value * pwdPrice : opt.price_vnd;
                addonPricesMap[opt.id] = price;
                addonsCost += price;
            }
        });
    });

    const clientPriceVnd = unitPrice + addonsCost;

    const cartItemData = {
      cartId: crypto.randomUUID(),
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      imageUrl: item.image_url,
      size: size,
      unitPrice: unitPrice,
      quantity: 1,
      sweetness: "FULL" as const,
      iceOption: "NORMAL" as const,
      coldwhisk: false,
      note: "",
      selectedOptionIds: defaultOptionIds,
      quantityMap: {},
      addonsPrice: addonsCost,
      addonPrices: addonPricesMap,
      quantityAddonOptions: [],
      selectedPowderId: isLatte ? undefined : defaultPowderId,
      selectedMilkTypeId: isLatte ? defaultMilk?.id : undefined,
      clientPriceVnd: clientPriceVnd,
      originalClientPriceVnd: unitPrice,
      addonVouchers: [],
      productVoucherId: undefined,
      productVoucherDiscountVnd: undefined,
    };

    addItem(cartItemData as any);
  };

  return (
    <motion.div
      onClick={() => onClick(item)}
      whileTap={{ scale: 0.96 }}
      className="group flex flex-row items-center justify-between gap-4 md:gap-5 w-full h-[130px] md:h-[150px] border-b border-dashed border-primary/20 last:border-0 transition-all duration-300 cursor-pointer bg-transparent"
    >
      {/* Image Area - 4/5 height */}
      <div className="h-[80%] aspect-square bg-[#eef1eb] relative overflow-hidden flex-shrink-0 rounded-2xl">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Coffee className="w-10 h-10 text-[#b8c9b4] group-hover:scale-110 transition-transform duration-500" />
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
                ✨ Theo mùa
              </span>
            )}
          </h3>
          {item.description && (
            <p className="text-[11px] text-primary/60 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Sizes & Prices */}
        <div className="mt-auto pt-2 grid grid-cols-4 items-end w-full">
          {['M', 'L', 'XL'].map((sizeKey) => {
            const s = sizes.find(s => s.size === sizeKey);
            const isDefault = sizeKey === 'L';
            
            if (!s) {
              return <div key={sizeKey}></div>;
            }

            const price = getDisplayPrice(s) / 1000;
            return (
              <div key={sizeKey} className="flex flex-col items-center gap-0.5">
                <span className={`uppercase tracking-wide whitespace-nowrap ${isDefault ? 'text-[10px] font-bold text-[#446c35]' : 'text-[9px] font-medium text-primary/40'}`}>
                  {SIZE_CARD_LABELS[sizeKey] ?? sizeKey}
                </span>
                <span className={`${isDefault ? 'text-base font-bold text-[#5b9a2b]' : 'text-sm font-semibold text-primary/50'}`}>
                  {price} ká
                </span>
              </div>
            );
          })}
          
          <div className="flex justify-end pb-0.5">
            <button 
              onClick={handleAddToCart}
              className="w-7 h-7 bg-[#5b9a2b] rounded-full flex items-center justify-center text-[#fdfcf7] hover:scale-110 active:scale-95 transition-transform"
              aria-label="Thêm vào giỏ"
            >
              <Plus size={16} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(MenuCard);
